import json
from channels.generic.websocket import AsyncWebsocketConsumer

class StreamConsumer(AsyncWebsocketConsumer):
    # Single room has multiple channels
    async def connect(self):
        self.room_group_name = 'Test-Room'

        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )

        await self.accept()

    async def disconnect(self,close_code):
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )

        print('Disconnected!')

    # Receive data from websocket(front-end) -> send -> all peers of that channel
    async def receive(self,text_data):
        # Convert Data from `js json -> py json`
        receive_dict = json.loads(text_data)
        message = receive_dict['message']

        await self.channel_layer.group_send(
            self.room_group_name,
            {
                # Define which callback will send that message - (send.message ~ send_message)
                'type': 'send.message',
                'message': message,
            }
        )

    # Callback to send message message from this peer to multiple channels of room (to other peers) (front-end)
    async def send_message(self,event):
        message = event['message']

        # Convert Data from `py json -> js json`
        await self.send(text_data=json.dumps(message))