import requests
def calculate_xp(
    grammar_score=0,
    pronunciation_score=0,
    message_count=1,
    completed=False
):

    xp = 0

    """
    Base XP per message
    """
    xp += message_count * 5

    """
    Grammar bonus
    """
    if grammar_score >= 80:
        xp += 10

    """
    Pronunciation bonus
    """
    if pronunciation_score >= 90:
        xp += 20

    """
    Mission completed
    """
    if completed:
        xp += 50

    return xp


def add_xp_to_progress(

    id_inscripcion,

    mission_id,

    xp_earned

):

    url = (
        "https://gb572ef1f8a56c6-caa23.adb.us-ashburn-1.oraclecloudapps.com/ords/api/progress/add-xp"
    )

    payload = {

        "id_inscripcion":
            id_inscripcion,

        "mission_id":
            mission_id,

        "xp_earned":
            xp_earned
    }

    response = requests.post(

        url,

        json=payload
    )

    #return response.json()
    return response.text