import json
from channels.generic.websocket import AsyncWebsocketConsumer
import paho.mqtt.client as mqtt
from pysilero_vad import SileroVoiceActivityDetector
import asyncio
import base64

# MQTT Broker settings
mqtt_broker = "34.93.105.92"
mqtt_username = "client"
mqtt_password = "client"
mqtt_port = 1883
mqtt_topic_publish = "audio/input/"
mqtt_topic_data = "audio/data/#"
mqtt_topic_response = "audio/response/#"

# MQTT Client setup
client = mqtt.Client(callback_api_version=mqtt.CallbackAPIVersion.VERSION2)

class StreamConsumer(AsyncWebsocketConsumer):

    message_chunk_index = 0

    audio_ready = False

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

        print(f"[StreamConsumer]:[init]")

        client.username_pw_set(mqtt_username, mqtt_password)
        client.on_connect = self.on_mqtt_client_connect
        client.on_message = self.on_mqtt_client_message
        client.connect(mqtt_broker, mqtt_port)
        client.loop_start()

        self.message_chunk_index = 0
        self.audio_ready = False

    # Single room has multiple channels
    async def connect(self): 
        print(f"[StreamConsumer]:[connect]")      

        self.room_group_name = 'Room-007'

        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )

        await self.accept()

    # Receive data from websocket(front-end) -> send -> all peers of that channel
    async def receive(self,text_data=None,bytes_data=None):
        print(f"[StreamConsumer]:[receive]: text_data:{text_data}")

        if text_data == 'stop-recording':
            client.publish(f"{mqtt_topic_publish}{self.message_chunk_index}", b"##")

            self.message_chunk_index = 0
            return

        audio_blob = bytes_data

        if audio_blob:
            # Apply Validate on the audio chunk
            validateIsSpeech = SileroVoiceActivityDetector()
            is_speech = validateIsSpeech(audio_blob)
            print(f"[StreamConsumer]:[receive]: is_speech={is_speech}")

            if is_speech >= 0.2:
                # Publish the audio data to MQTT if it contains speech
                client.publish(f"{mqtt_topic_publish}{self.message_chunk_index}", audio_blob)
            else:
                client.publish(f"{mqtt_topic_publish}{self.message_chunk_index}", b"##")

            self.message_chunk_index += 1

    # Callback to send message message from this peer to multiple channels of room (to other peers) (front-end)
    # async def send_message(self,payload):
    #     print(f"[StreamConsumer]:[send_message]: type:{type(payload)}")

    #     await self.send(bytes_data=payload)

    async def disconnect(self,close_code):
        await self.channel_layer.group_discard( 
            self.room_group_name,
            self.channel_name
        )

        self.message_chunk_index = 0

        print(f"[StreamConsumer]:[disconnect]: Disconnected!")

    ############ mqtt functions #############

    def on_mqtt_client_connect(self, client, user_data, flags, reason_code, properties=None):
        print(f"[StreamConsumer]:[on_mqtt_client_connect]: mqtt client connected")

        # client.subscribe(mqtt_topic_data)
        client.subscribe(mqtt_topic_response)

    audio_chunks = []

    def on_mqtt_client_message(self, client, user_data, msg):
        print(f"[StreamConsumer]:[on_mqtt_client_message]: Received new mqtt client message on topic:{msg.topic}: type:{type(msg.payload)} - {len(msg.payload)} bytes")

        if "audio/response" in msg.topic:
            if (msg.payload[-2:] == b"##") and (self.audio_ready == False):
                print(f"[StreamConsumer]:[on_mqtt_client_message]: complete response received")

                audio_data = b''.join(self.audio_chunks)

                audio_base64 = base64.b64encode(audio_data).decode('utf-8')

                asyncio.run(self.send(audio_base64))

                self.audio_ready = True

                self.audio_chunks = []
            else:
                self.audio_chunks.append(msg.payload)
    
    # def write_to_wav(self, chunks, file_path):
    #     SAMPLE_RATE = 16000
    #     SAMPLE_WIDTH = 2
    #     CHANNELS = 1

    #     with wave.open(file_path, 'wb') as wav_file:
    #         wav_file.setnchannels(CHANNELS)
    #         wav_file.setsampwidth(SAMPLE_WIDTH)
    #         wav_file.setframerate(SAMPLE_RATE)
    #         for chunk in chunks:
    #             wav_file.writeframes(chunk)






##views.py


# from django.shortcuts import render
# from django.http import HttpResponse, JsonResponse
# from django.views.decorators.csrf import csrf_exempt
# import paho.mqtt.client as mqtt
# import time
# import wave
# from pysilero_vad import SileroVoiceActivityDetector
# from channels.layers import get_channel_layer
# from asgiref.sync import async_to_sync
# import io
# import base64
# import json
# def pcm_to_wav(pcm_data, sample_rate=24000, sample_width=2, channels=1):
#     """Convert PCM data to WAV format."""
#     wav_file = io.BytesIO()
#     with wave.open(wav_file, 'wb') as wav:
#         wav.setnchannels(channels)
#         wav.setsampwidth(sample_width)
#         wav.setframerate(sample_rate)
#         wav.writeframes(pcm_data)
#     wav_file.seek(0)
#     return wav_file

# # MQTT Broker settings
# mqtt_broker = "localhost"
# mqtt_username = "client"
# mqtt_password = "client"
# mqtt_port = 1883
# mqtt_topic_publish = "audio/input/"
# mqtt_topic_data = "audio/data/#"
# mqtt_topic_response = "audio/response/#"

# # MQTT Client setup
# client = mqtt.Client(callback_api_version=mqtt.CallbackAPIVersion.VERSION2)
# client.username_pw_set(mqtt_username, mqtt_password)

# # Flag to indicate audio readiness (this would be set based on your actual logic)
# audio_ready = False
# audio_chunks = []
# first_chunk = True
# start = None

# AUDIO_FILE_PATH = "output.wav"
# vad = SileroVoiceActivityDetector()

# def on_connect(client, userdata, flags, rc, properties=None):
#     print(f"Connected with result code {rc}")
#     client.subscribe(mqtt_topic_data)
#     client.subscribe(mqtt_topic_response)

# def on_message(client, userdata, msg, properties=None):
#     global first_chunk, start

#     if "audio/response" in msg.topic:
#         if first_chunk:
#             start = time.time()
#             first_chunk = False

#         if msg.payload[-2:] == b"##":  # End of message
#             end = time.time()
#             print(f"time taken for all chunks: {end-start}")
#             print("End of message received.")
#             first_chunk = True

#             # Send a special message to indicate the end of chunks
#             channel_layer = get_channel_layer()
#             async_to_sync(channel_layer.group_send)(
#                 "audio_group",
#                 {
#                     "type": "send_audio",
#                     "audio_data": base64.b64encode(b"").decode('utf-8'),
#                     "end_of_chunks": True,
#                 },
#             )
#         else:
#             # Send the audio chunk through WebSocket
#             channel_layer = get_channel_layer()
#             async_to_sync(channel_layer.group_send)(
#                 "audio_group",
#                 {
#                     "type": "send_audio",
#                     "audio_data": base64.b64encode(msg.payload).decode('utf-8'),
#                     "end_of_chunks": False,
#                 },
#             )

# # def on_message(client, userdata, msg, properties=None):
# #     global first_chunk, start, audio_ready, audio_chunks
# #     # print(f"Received message on {msg.topic}: {len(msg.payload)} bytes")

# #     if "audio/response" in msg.topic:
# #         if first_chunk:
# #             start = time.time()
# #             first_chunk = False

# #         if msg.payload[-2:] == b"##":  # End of message
# #             end = time.time()
# #             print(f"time taken for all chunks : {end-start}")
# #             print("End of message received.")
# #             # Convert PCM data to WAV format
# #             start = time.time()
# #             pcm_data = b''.join(audio_chunks)
# #             wav_file = pcm_to_wav(pcm_data)
# #             end = time.time()
# #             print(f"time taken to make Wav file : {end-start}")
# #             audio_chunks = []  # Clear the chunks list
# #             audio_ready = True  # Set the audio_ready flag

# #             start = time.time()
# #             # Send the WAV file through WebSocket
# #             channel_layer = get_channel_layer()
# #             async_to_sync(channel_layer.group_send)(
# #                 "audio_group",
# #                 {
# #                     "type": "send_audio",
# #                     "audio_data": wav_file.getvalue(),
# #                 },
# #             )
# #             end = time.time()
# #             print(f"time taken to send message across : {end-start}")
# #             first_chunk = True

# #         else:
# #             audio_chunks.append(msg.payload)

# #     if "audio/data" in msg.topic:
# #         if msg.payload[-2:] == b"##":  # End of message
# #             print("End of message received.")
# #             # Convert PCM data to WAV format
# #             pcm_data = b''.join(audio_chunks)
# #             wav_file = pcm_to_wav(pcm_data, sample_rate=44100, channels=2)
# #             audio_chunks = []  # Clear the chunks list
# #             audio_ready = True  # Set the audio_ready flag

# #             # Send the WAV file through WebSocket
# #             channel_layer = get_channel_layer()
# #             print("playing song now")
# #             async_to_sync(channel_layer.group_send)(
# #                 "audio_group",
# #                 {
# #                     "type": "send_audio",
# #                     "audio_data": wav_file.getvalue(),
# #                 },
# #             )
# #         else:
# #             audio_chunks.append(msg.payload)


# def write_to_wav(chunks, file_path, rate=24000, width=2, channel=1):
#     SAMPLE_RATE = rate
#     SAMPLE_WIDTH = width
#     CHANNELS = channel

#     """Write audio chunks to a WAV file."""
#     with wave.open(file_path, 'wb') as wav_file:
#         wav_file.setnchannels(CHANNELS)
#         wav_file.setsampwidth(SAMPLE_WIDTH)
#         wav_file.setframerate(SAMPLE_RATE)
#         for chunk in chunks:
#             wav_file.writeframes(chunk)

# client.on_connect = on_connect
# client.on_message = on_message
# client.connect(mqtt_broker, mqtt_port)
# client.loop_start()

# @csrf_exempt
# def record_audio(request):
#     global message_index, audio_ready
#     if request.method == 'POST':
#         action = request.POST.get('action')
#         if action == 'start':
#             # Reset the message index when starting a new recording
#             message_index = 0
#             audio_ready = False
#         elif action == 'stop':
#             # Append the end token and publish when stopping the recording
#             client.publish(f"{mqtt_topic_publish}{message_index + 1}", b"##")
#             print("Published End of Sentence")
#         elif action == 'play_sample':
#             # Return the sample WAV file as a response
#             with open('sample.wav', 'rb') as file:
#                 response = HttpResponse(file.read(), content_type='audio/wav')
#                 response['Content-Disposition'] = 'attachment; filename="sample.wav"'
#                 return response
#         else:
#             audio_data = request.FILES.get('audio')
#             if audio_data:
#                 # Process the received audio data
#                 chunk_data = audio_data.read()
                
#                 # Apply VAD on the audio chunk
#                 is_speech = vad(chunk_data)
#                 print(is_speech)
#                 if is_speech >= 0.2:
#                     # Publish the audio data to MQTT if it contains speech
#                     client.publish(f"{mqtt_topic_publish}{message_index}", chunk_data)
#                     message_index += 1
#                     return HttpResponse('continue')
#                 else:
#                     client.publish(f"{mqtt_topic_publish}{message_index}", chunk_data)
#                     message_index += 1
#                     return HttpResponse('stop')
                    
#     return render(request, 'audio_app/record.html')

    
# def send_audio(self, event):
#     audio_data = event["audio_data"]
#     self.send(text_data=json.dumps({
#         "audio_data": audio_data,
#         "end_of_chunks": event["end_of_chunks"]
#     }))