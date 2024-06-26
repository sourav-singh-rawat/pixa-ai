import json
from channels.generic.websocket import AsyncWebsocketConsumer
import paho.mqtt.client as mqtt
from pysilero_vad import SileroVoiceActivityDetector
import asyncio
import wave

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

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

        print(f"[StreamConsumer]:[init]")

        client.username_pw_set(mqtt_username, mqtt_password)
        client.on_connect = self.on_mqtt_client_connect
        client.on_message = self.on_mqtt_client_message
        client.connect(mqtt_broker, mqtt_port)
        client.loop_start()

        self.message_chunk_index = 0

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
        print(f"[StreamConsumer]:[receive]: text_data:{text_data} byte_data_type:{type(bytes_data)}")

        if text_data == 'stop-recording':
            print(f"[StreamConsumer]:[receive] | signal->'stop-recording' | Public stop")

            client.publish(f"{mqtt_topic_publish}{self.message_chunk_index}", b"##")

            self.message_chunk_index = 0

            # await self.send(text_data='stop-consuming')

            return

        # await self.send(bytes_data=bytes_data)

        audio_blob = bytes_data

        if audio_blob:
            # Apply Validate on the audio chunk
            validateIsSpeech = SileroVoiceActivityDetector()
            is_speech = validateIsSpeech(audio_blob)
            print(f"[StreamConsumer]:[receive]: is_speech={is_speech}")

            if is_speech >= 0.2:
                # Publish the audio data to MQTT if it contains speech
                print(f"[StreamConsumer]:[receive] Publishing chunk")

                client.publish(f"{mqtt_topic_publish}{self.message_chunk_index}", audio_blob)
            else:
                print(f"[StreamConsumer]:[receive] | not->is_speech | Public stop")

                # TODO: Use for speech detection stopwatch
                # client.publish(f"{mqtt_topic_publish}{self.message_chunk_index}", b"##")

            self.message_chunk_index += 1

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
        
        # For Ai generative audio response
        client.subscribe(mqtt_topic_response)

        # For Ai data gathered audio response
        client.subscribe(mqtt_topic_data)

    # audio_chunks=[]

    def on_mqtt_client_message(self, client, user_data, msg):
        print(f"[StreamConsumer]:[on_mqtt_client_message]: Received new mqtt client message on topic:{msg.topic}: type:{type(msg.payload)} - {len(msg.payload)} bytes")

        if "audio/response/0" in msg.topic:
            asyncio.run(self.send(text_data='start-generative-response'))
        elif "audio/data/0" in msg.topic:
            asyncio.run(self.send(text_data='start-data-response'))

        if msg.payload[-2:] == b"##":
            print(f"[StreamConsumer]:[on_mqtt_client_message]: complete response received")

            asyncio.run(self.send(text_data='stop-consuming'))

            # if len(self.audio_chunks) != 0:
            #     self.write_to_wav(self.audio_chunks)
            #     self.audio_chunks=[]

        else:
            asyncio.run(self.send(bytes_data=msg.payload))

            # if "audio/data" in msg.topic:
            #     self.audio_chunks.append(msg.payload)

    # def write_to_wav(self,chunks):
    #     SAMPLE_RATE = 44100
    #     SAMPLE_WIDTH = 2
    #     CHANNELS = 2

    #     """Write audio chunks to a WAV file."""
    #     with wave.open(f"output{len(chunks)}.wav", 'wb') as wav_file:
    #         wav_file.setnchannels(CHANNELS)
    #         wav_file.setsampwidth(SAMPLE_WIDTH)
    #         wav_file.setframerate(SAMPLE_RATE)
    #         for chunk in chunks:
    #             wav_file.writeframes(chunk)