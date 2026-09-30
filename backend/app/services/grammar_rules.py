def grammar_rules(grammar):
    """
    Reglas gramaticales de una misión como lista.
    Acepta el formato actual ({...primeraRegla, "rules": [...]}), una lista,
    o el formato anterior (un solo objeto con title/rule/explanation).
    """
    if not grammar:
        return []

    if isinstance(grammar, list):
        rules = grammar
    elif isinstance(grammar.get("rules"), list):
        rules = grammar["rules"]
    else:
        rules = [grammar]

    return [
        r for r in rules
        if isinstance(r, dict) and (r.get("title") or r.get("rule") or r.get("explanation"))
    ]
