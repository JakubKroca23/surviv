#!/bin/bash
PROJECT="surviv"
KEY="standard_f941d867b7c7499244540815ffa5b6eb975d4badbf48f4c2cac13710b2fec5421668434623e6e96ea82388ab8ee495b0637f6bfc4cfb61e0d2eaa8a04e04f9e80ee814906ea2f6a55746d61cffa34269137ea3c5aa5f09f69738b575fdea58e52d12556e30b4cd6e461cd1f3de1a8da48e3a9a1fa3263896c4a0885c208160dd"
API="https://appwrite.propoj.app/v1/databases/surviv/collections"

# Kolekce Rooms
echo "Vytvarim rooms kolekci..."
curl -s -X POST $API \
  -H "X-Appwrite-Project: $PROJECT" -H "X-Appwrite-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"collectionId": "rooms", "name": "Rooms", "permissions": ["read(\"any\")", "create(\"any\")", "update(\"any\")", "delete(\"any\")"]}'

curl -s -X POST $API/rooms/attributes/string \
  -H "X-Appwrite-Project: $PROJECT" -H "X-Appwrite-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"key": "name", "size": 100, "required": true}'
curl -s -X POST $API/rooms/attributes/string \
  -H "X-Appwrite-Project: $PROJECT" -H "X-Appwrite-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"key": "hostId", "size": 100, "required": true}'
curl -s -X POST $API/rooms/attributes/string \
  -H "X-Appwrite-Project: $PROJECT" -H "X-Appwrite-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"key": "status", "size": 20, "required": true}'
curl -s -X POST $API/rooms/attributes/integer \
  -H "X-Appwrite-Project: $PROJECT" -H "X-Appwrite-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"key": "aiCount", "required": false}'
curl -s -X POST $API/rooms/attributes/integer \
  -H "X-Appwrite-Project: $PROJECT" -H "X-Appwrite-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"key": "lastUpdate", "required": true}'

# Kolekce Messages
echo -e "\nVytvarim messages kolekci..."
curl -s -X POST $API \
  -H "X-Appwrite-Project: $PROJECT" -H "X-Appwrite-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"collectionId": "messages", "name": "Messages", "permissions": ["read(\"any\")", "create(\"any\")", "update(\"any\")", "delete(\"any\")"]}'

curl -s -X POST $API/messages/attributes/string \
  -H "X-Appwrite-Project: $PROJECT" -H "X-Appwrite-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"key": "roomId", "size": 100, "required": true}'
curl -s -X POST $API/messages/attributes/string \
  -H "X-Appwrite-Project: $PROJECT" -H "X-Appwrite-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"key": "sender", "size": 100, "required": true}'
curl -s -X POST $API/messages/attributes/string \
  -H "X-Appwrite-Project: $PROJECT" -H "X-Appwrite-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"key": "text", "size": 500, "required": true}'
curl -s -X POST $API/messages/attributes/integer \
  -H "X-Appwrite-Project: $PROJECT" -H "X-Appwrite-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"key": "timestamp", "required": true}'

# Uprava kolekce Players
echo -e "\nPridavam roomId do players..."
curl -s -X POST $API/players/attributes/string \
  -H "X-Appwrite-Project: $PROJECT" -H "X-Appwrite-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"key": "roomId", "size": 100, "required": false}'

echo -e "\nHOTOVO"
