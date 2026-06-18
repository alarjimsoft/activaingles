import requests
def calculate_xp(
    grammar_score=0,
    pronunciation_score=0,
    message_count=1,
    completed=False,
    practice_score=None,
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
    if pronunciation_score >= 70:
        xp += 5

    if pronunciation_score >= 80:
        xp += 10

    if pronunciation_score >= 90:
        xp += 20

    """
    Practice score bonus
    """
    if practice_score is not None:
        if practice_score >= 95:
            xp += 50
        elif practice_score >= 80:
            xp += 30
        elif practice_score >= 60:
            xp += 15

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