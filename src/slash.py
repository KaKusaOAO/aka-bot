import requests

url = "https://discord.com/api/v8/applications/<app_id>/guilds/<guild_id>/commands"

# For authorization, you can use either your bot token 
headers = {
    "Authorization": "Bot <token>"
}

json = {
    "name": "cancel",
    "description": "Cancel the scheduled event.",
}

requests.post(url, headers=headers, json=json)

json = {
    "name": "kab",
    "description": "Schedule an event to clean up inactive members.",
    "options": [
        {
            "name": "month",
            "description": "The month of the event.",
            "type": 4,
            "required": True
        },
        {
            "name": "date",
            "description": "The date of the event.",
            "type": 4,
            "required": True
        },
        {
            "name": "hour",
            "description": "The hour of the event.",
            "type": 4,
            "required": True
        },
        {
            "name": "minute",
            "description": "The minute of the event.",
            "type": 4,
            "required": True
        }
    ]
}

requests.post(url, headers=headers, json=json)