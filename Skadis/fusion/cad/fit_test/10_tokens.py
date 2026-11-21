# Fit-test tokens: one hook tab each, tab width x gap from CFG["tokens"]; a board section behind them for pictures.
# Token i, j sits in the slot at X = 40 i, Z = -40 j (same slot parity; the tokens are 36 mm tall).


def run(_context: str):
    widths, gaps = CFG["tokens"]["widths"], CFG["tokens"]["gaps"]
    for i, w in enumerate(widths):
        for j, g in enumerate(gaps):
            name = "Token_W%02d_G%02d" % (round(w * 10), round(g * 10))
            comp = fresh_component(name).component
            fit_token(comp, 40.0 * i, -40.0 * j, w, g, "W%.1f\nG%.1f" % (w, g))
            appearance(comp, "Plastic - Matte (Yellow)")
    board = fresh_component("_board").component
    skadis_board(board, -30.0, 40.0 * (len(widths) - 1) + 30.0, -40.0 * (len(gaps) - 1) - 50.0, 40.0)
    appearance(board, "Plastic - Matte (White)")
    print("tokens:", len(widths) * len(gaps))
