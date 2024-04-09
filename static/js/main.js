console.log('Hello world!, I am main.js');

const btnRecording = document.getElementById('btn-recording');

var webSocket,remote;
var connection1, connection2;
var recorder;

const init = async ()=>{
    console.log('[init]:');
    
    setupWebsocket.call();

    btnRecording.addEventListener('click',onPressedRecording);

    window.addEventListener('error', (event) => {
        if (event.message.includes('message port closed')) {
            alert('Message port closed before a response was received.');
            // Handle the error condition appropriately
        }
    });
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


const audioContext = new (window.AudioContext || window.webkitAudioContext)();
let bufferSource = null;
let sampleRate = 24000; // Adjust the sample rate based on your PCM format
let bufferSize = 2048; // Adjust the buffer size based on your needs
let numberOfChannels = 1;

let audioResponseChunks = [];
let isConsumingAudioResponse = true;

// ############### Chunks buffer audio play ###################

// let audioBuffer = audioContext.createBuffer(1, bufferSize, sampleRate);
// let currentWritePosition = 0;

// const onWebsocketMessage =  async (event) => {
//   console.log(`[onWebsocketMessage]: ${event} ~> ${event.data}`);
//   try {
//     if (event.data === 'stop-consuming') {
//       return;
//     }

//     const blob = event.data;
//     const arrayBuffer = await new Response(blob).arrayBuffer();

//     const pcmData = new Int16Array(arrayBuffer);
//     const floatData = new Float32Array(pcmData.length);

//     for (let i = 0; i < pcmData.length; i++) {
//         floatData[i] = pcmData[i] / 32768; // Convert 16-bit signed integer to float
//     }

//     const availableSpace = bufferSize - currentWritePosition;

//     if (floatData.length <= availableSpace) {
//         // If the received data fits within the remaining space in the buffer
//         audioBuffer.copyToChannel(floatData, 0, currentWritePosition);
//         currentWritePosition += floatData.length;
//     } else {
//         // If the received data exceeds the remaining space in the buffer
//         const firstPart = floatData.subarray(0, availableSpace);
//         const secondPart = floatData.subarray(availableSpace);

//         audioBuffer.copyToChannel(firstPart, 0, currentWritePosition);
//         currentWritePosition = secondPart.length;

//         // Create a new audio buffer for the remaining data
//         const newBuffer = audioContext.createBuffer(1, bufferSize, sampleRate);
//         newBuffer.copyToChannel(secondPart, 0);
//         audioBuffer = newBuffer;
//     }

//     // If the buffer is full, create a buffer source and start playing
//     if (currentWritePosition === bufferSize) {
//         const bufferSource = audioContext.createBufferSource();
//         bufferSource.buffer = audioBuffer;
//         bufferSource.connect(audioContext.destination);
//         bufferSource.start();

//         // Reset the write position and create a new audio buffer
//         currentWritePosition = 0;
//         audioBuffer = audioContext.createBuffer(1, bufferSize, sampleRate);
//     }
//   } catch (e) {
//     onCatch(e);
//   }
// };

// ############### Complete audio play ###################

const onWebsocketMessage = async (event) => {
  console.log(`[onWebsocketMessage]: ${event} ~> ${event.data}`);
  try {
    if (event.data === 'stop-consuming') {
        isConsumingAudioResponse = false;
        playAudio();
        return;
    }

    if(event.data == 'start-generative-response') {
        sampleRate = 24000;
        bufferSize = 2048;
        numberOfChannels = 1;
        audioResponseChunks = [];
        isConsumingAudioResponse = true;

        console.log('[onWebsocketMessage]: Start listing generative audio response')
        return;
    }

    if(event.data == 'start-data-response') {
        sampleRate = 44100;
        bufferSize = 2048;
        numberOfChannels = 2;
        audioResponseChunks = [];
        isConsumingAudioResponse = true;

        console.log('[onWebsocketMessage]: Start listing data audio response')
        return;
    }

    if (isConsumingAudioResponse) {
        const blob = event.data;
        const arrayBuffer = await new Response(blob).arrayBuffer();
        const pcmData = new Int16Array(arrayBuffer);
        audioResponseChunks.push(pcmData);
    }
  } catch (e) {
    onCatch(e);
  }
};

const playAudio = () => {
    if (bufferSource) {
       stopCurrentAudio();
    }

    const totalLength = audioResponseChunks.reduce((length, chunk) => length + chunk.length, 0);

    if (totalLength === 0) {
        console.warn('No audio data to play.');
        return;
    }

    const audioBuffer = audioContext.createBuffer(numberOfChannels, totalLength, sampleRate);
    let offset = 0;

    for (const chunk of audioResponseChunks) {
        const floatData = new Float32Array(chunk.length);
        for (let i = 0; i < chunk.length; i++) {
        floatData[i] = chunk[i] / 32768; // Convert 16-bit signed integer to float
        }
        audioBuffer.copyToChannel(floatData, 0, offset);
        offset += chunk.length;
    }

    bufferSource = audioContext.createBufferSource();
    bufferSource.buffer = audioBuffer;
    bufferSource.connect(audioContext.destination);
    bufferSource.start();
}

const stopCurrentAudio = () => {
    if (bufferSource) {
        bufferSource.stop();
        bufferSource = null;
    }
}

const sendMessageToWebsocket = (payload) => {
    webSocket.send(payload)
}

const onPressedRecording = async ()=> {
    try {
        if(btnRecording.innerHTML == 'Start Recording'){
            console.log('[onPressedRecording]: Start Recording')

            btnRecording.disabled = true;

            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
            });
            
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
            console.log('[onPressedRecording]: Stop Recording')

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