console.log('Hello world!, I am main.js');

const btnRecording = document.getElementById('btn-recording');

var webSocket;
var connection1, connection2;
var recorder;

// Define video constraints
const videoConstraints = {
    audio: true,
    video: false,
};

const init = async ()=>{
    console.log('[init]:');
    
    setupWebsocket.call();

    btnRecording.addEventListener('click',onPressedRecording)
}

window.onload = init

const setupWebsocket = ()=>{
    console.log('[setupWebsocket]');

    let loc = window.location;
    var wsStart = 'ws://';
    
    if(loc.protocol == 'https:'){
        wsStart == 'wss://';
    }
    
    var endPoint = wsStart + loc.host + loc.pathname;
    
    console.log(`[setupWebsocket]: ${endPoint}`);

    webSocket = new WebSocket(endPoint);

    webSocket.addEventListener('open',(e)=>{
        console.log('[setupWebsocket]:[webSocket:addEventListener:open] Connection opened!');

        // Setup peer-connection between two system
        peerConnection.call();
    });
    
    webSocket.addEventListener('close',(e)=>{
        console.log('[setupWebsocket]:[webSocket:addEventListener:close] Connection closed!');
    });
    
    webSocket.addEventListener('error',(e)=>{
        console.log(`[setupWebsocket]:[webSocket:addEventListener:error] Error: ${e}`);
    });
    
    webSocket.addEventListener('message',onWebsocketMessage)
}

const peerConnection = async ()=> {
    connection1 = new RTCPeerConnection();
    connection1.addEventListener('icecandidate', e => onIceCandidate(connection1, e));
    connection1.addEventListener('iceconnectionstatechange', e => onIceStateChange(connection1, e));

    connection2 = new RTCPeerConnection();
    connection2.addEventListener('icecandidate', e => onIceCandidate(connection2, e));
    connection2.addEventListener('iceconnectionstatechange', e => onIceStateChange(connection2, e));
    connection2.addEventListener('track', attachRemoteMedia);
    
    try {
        console.log('[peerConnection]: connection1 createOffer start');

        const offer = await connection1.createOffer({
            iceRestart: true,
            offerToReceiveAudio: true,
            offerToReceiveVideo: true,
        });
        await onCreateOfferSuccess(offer);
    } catch (e) {
        onCatch(e);
    }
}

const onCreateOfferSuccess = async (desc) => {
    console.log(`[onCreateOfferSuccess]: Offer from connection1\nsdp: ${desc.sdp}`);
    try {
        await connection1.setLocalDescription(desc);
    } catch (e) {
        onCatch(e)
    }

    try {
        await connection2.setRemoteDescription(desc);
    } catch (e) {
        onCatch(e)
    }


    try {
        const answer = await connection2.createAnswer();
        await onCreateAnswerSuccess(answer);
    } catch (e) {
        onCatch(e);
    }
}

const onCreateAnswerSuccess = async (desc) =>{
    try {
        await connection2.setLocalDescription(desc);
    } catch (e) {
        onCatch(e)
    }

    try {
        await connection1.setRemoteDescription(desc);
    } catch (e) {
        onCatch(e)
    }
}

const onIceCandidate = async (connection, event)=> {
    try {
        await (getOtherConnection(connection).addIceCandidate(event.candidate));

        console.log(`[onIceCandidate]: ${getName(connection)} addIceCandidate success`);
    } catch (e) {
        onCatch(connection, e);
    }

    console.log(`[onIceCandidate]: ${getName(connection)} ICE candidate:\n${event.candidate ? event.candidate.candidate : '(null)'}`);
}

const onIceStateChange = (connection, event) => {
    if (connection) {
        console.log(`[onIceStateChange]: ${getName(connection)} ICE state: ${connection.iceConnectionState}`);

        console.log('[onIceStateChange]: ICE state change event: ', event);
    }
}

const getName = (connection) => {
    return (connection === connection1) ? 'connection1' : 'connection2';
}

const getOtherConnection = (connection) => {
    return (connection === connection1) ? connection2 : connection1;
}

const attachRemoteMedia = (e)=> {
    // if (remoteVideoFrame.srcObject !== e.streams[0]) {
    //     remoteVideoFrame.srcObject = e.streams[0];
    // }
}

const onWebsocketMessage = async (event)=>{
    console.log(`[onWebsocketMessage]: ${event} ~> ${event.data}`);

    try {
        const audioData = event.data;
    
        // Decode Base64 to binary
        const audioBytes = atob(audioData);
        const audioBuffer = new Uint8Array(audioBytes.length);
        
        for (let i = 0; i < audioBytes.length; i++) {
            audioBuffer[i] = audioBytes.charCodeAt(i);
        }
        
        // Create Blob from binary data
        const blob = new Blob([audioBuffer], { type: 'audio/ogg' });

        // Create URL from Blob
        const audioURL = URL.createObjectURL(blob);

        // Set audio element source and play
        var player = new Audio(audioURL);
        await player.play()
        
        // const audioData = event.data;
        // const blob = new Blob([audioData], { type: 'audio/wav' });
        // const audioURL = URL.createObjectURL(blob);

        // audioElement.src = audioURL;
        // audioElement.play();
    } catch (e) {
        onCatch(e)
    }
}

const sendMessageToWebsocket = (payload) => {
    webSocket.send(payload)
}

const onPressedRecording = async ()=> {
    console.log('[onPressedRecording]');

    try {
        if(btnRecording.innerHTML == 'Start Recording'){
            btnRecording.disabled = true;

            const stream = await navigator.mediaDevices.getUserMedia(videoConstraints);

            recorder = new RecordRTC(stream, {
                type: 'audio',
                mimeType: 'audio/wav',
                sampleRate: 44100,
                numberOfAudioChannels: 1,
                desiredSampRate: 16000,
                recorderType: StereoAudioRecorder,
                timeSlice: 500,
                ondataavailable: (blob)=> {
                    console.log(`[onPressedRecording]:[ondataavailable]: Audio Recorded 500ms chunk: ${blob}`)

                    sendMessageToWebsocket(blob);
                }
            });

            await recorder.startRecording();

            btnRecording.innerHTML = 'Stop Recording';
            btnRecording.disabled = false;
        }else if(btnRecording.innerHTML == 'Stop Recording'){
            btnRecording.disabled = true;
            btnRecording.innerHTML = 'Start Recording'

            await recorder.stopRecording();

            sendMessageToWebsocket('stop-recording');

            btnRecording.disabled = false;
        }
    } catch (e) {
        onCatch(e)
    }
}

const onCatch = (error)=>{
    const errorElement = document.querySelector('#error-message');
    errorElement.innerHTML += `<p>Error :- Something went wrong: ${error.name}</p>`;

    console.log(`[onCatch]: ${error}`)
}

const disconnect = ()=> {
    connection1.close();
    connection2.close();
    connection1 = null;
    connection2 = null;
}