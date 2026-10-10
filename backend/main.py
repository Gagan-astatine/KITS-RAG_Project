from fastapi import FastAPI
from pydantic import BaseModel
from fastembed import TextEmbedding

app = FastAPI()

# Loaded once at startup, not per request
model = TextEmbedding("sentence-transformers/all-MiniLM-L6-v2")


class EmbedRequest(BaseModel):
    texts: list[str]


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/embed")
def embed(req: EmbedRequest):
    vectors = [v.tolist() for v in model.embed(req.texts)]
    return {"embeddings": vectors}