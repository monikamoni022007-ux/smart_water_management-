from __future__ import annotations

import os
from flask import Flask
from database.db import WaterDatabase
from routes.api_routes import api_bp
from routes.web_routes import web_bp


def create_app(db_path: str | None = None) -> Flask:
    app = Flask(__name__)
    app.secret_key = os.environ.get("FLASK_SECRET_KEY", "aqualedger-capstone-local-key")
    app.config["WATER_DB"] = WaterDatabase(db_path=db_path)
    app.register_blueprint(web_bp)
    app.register_blueprint(api_bp)
    return app


if __name__ == "__main__":
    application = create_app()
    application.run(host="127.0.0.1", port=5000, debug=True)
