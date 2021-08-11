import requests


url = "https://discord.com/api/v8/applications/732155687995572326/guilds/766819273087647754/commands"

"""
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
"""

json = {
    "name": "cancel",
    "description": "Cancel the scheduled event.",
}

# For authorization, you can use either your bot token 
headers = {
    "Authorization": "Bot NzMyMTU1Njg3OTk1NTcyMzI2.XwwfHg.EH6o1qtRRHA1FnJweUkljRZzFLI"
}

r = requests.post(url, headers=headers, json=json)