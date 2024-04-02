console.log('Hello world!, I am main.js');

const localVideoFrame = document.getElementById('local-video');
const remoteVideoFrame = document.getElementById('remote-Video');

var webSocket, localStream, connection1, connection2;

// Define video constraints
const videoConstraints = {
    audio: true,
    video: true,
};

const init = async ()=>{
    console.log('fn: init');
    
    await attachLocalMedia.call();
    setupWebsocket.call();
}

window.onload = init

const attachLocalMedia = async ()=> {
    console.log('fn: attachLocalMedia');

    try {
        const stream = await navigator.mediaDevices.getUserMedia(videoConstraints);

        localVideoFrame.srcObject = stream;
        localStream = stream;
    } catch (e) {
        onCatch(e)
    }
}

const setupWebsocket = ()=>{
    console.log('fn: setupWebsocket');

    let loc = window.location;
    var wsStart = 'ws://';
    
    if(loc.protocol == 'https:'){
        wsStart == 'wss://';
    }
    
    var endPoint = wsStart + loc.host + loc.pathname;
    
    console.log(endPoint);

    webSocket = new WebSocket(endPoint);

    webSocket.addEventListener('open',(e)=>{
        console.log('Connection opened!');

        webSocket.send(JSON.stringify({
            'message':'This message is broadcasted for everyone using websocket',
        }))

        // Setup peer-connection between two system
        peerConnection.call();
    });
    
    webSocket.addEventListener('close',(e)=>{
        console.log('Connection closed!');
    });
    
    webSocket.addEventListener('error',(e)=>{
        console.log(`Error occurred: ${e}`);
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
    
    localStream.getTracks().forEach(track => connection1.addTrack(track, localStream));

    try {
        console.log('connection1 createOffer start');

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
    console.log(`Offer from connection1\nsdp: ${desc.sdp}`);
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

        console.log(`${getName(connection)} addIceCandidate success`);
    } catch (e) {
        onCatch(connection, e);
    }

    console.log(`${getName(connection)} ICE candidate:\n${event.candidate ? event.candidate.candidate : '(null)'}`);
}

const onIceStateChange = (connection, event) => {
    if (connection) {
        console.log(`${getName(connection)} ICE state: ${connection.iceConnectionState}`);

        console.log('ICE state change event: ', event);
    }
}

const getName = (connection) => {
    return (connection === connection1) ? 'connection1' : 'connection2';
}

const getOtherConnection = (connection) => {
    return (connection === connection1) ? connection2 : connection1;
}

const attachRemoteMedia = (e)=> {
    if (remoteVideoFrame.srcObject !== e.streams[0]) {
        remoteVideoFrame.srcObject = e.streams[0];
    }
}

const onWebsocketMessage = (event)=>{
    console.log('fn: onWebsocketMessage');

    var parsedData = JSON.parse(event.data);

    console.log(parsedData);
}

const createMediaDom = ()=>{
    var videoContainer = document.querySelector('#video-container');
    
    var videoTag = document.createElement('video');

    videoTag.id = `${Math.random()}-video`;
    videoTag.autoplay = true;
    videoTag.playsInline = true;

    var videoTagWrapper = document.createElement('div');
    
    videoContainer.appendChild(videoTagWrapper);

    videoTagWrapper.appendChild(videoTag);

    return videoTag;
}

const onCatch = (error)=>{
    const errorElement = document.querySelector('#error-message');
    errorElement.innerHTML += `<p>Something went wrong: ${error.name}</p>`;
}

const disconnect = ()=> {
    connection1.close();
    connection2.close();
    connection1 = null;
    connection2 = null;

    localVideoFrame.srcObject = null;
}