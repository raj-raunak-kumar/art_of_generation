from flask import Flask, request, jsonify, render_template
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM

app = Flask(__name__)

print("Loading model and tokenizer (gpt2)...")
tokenizer = AutoTokenizer.from_pretrained("gpt2")
model = AutoModelForCausalLM.from_pretrained("gpt2")
print("Model loaded successfully!")

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/logits", methods=["POST"])
def get_logits():
    data = request.json
    text = data.get("text", "")
    
    if not text:
        return jsonify({"logits": []})
        
    try:
        inputs = tokenizer(text, return_tensors="pt")
        with torch.no_grad():
            outputs = model(**inputs)
            
            # Get logits for the very last token
            next_token_logits = outputs.logits[0, -1, :]
            
            # We only need the top 50 to send to frontend (otherwise payload is too big)
            top_k = 50
            top_logits, top_indices = torch.topk(next_token_logits, top_k)
            
            results = []
            for logit, idx in zip(top_logits, top_indices):
                token_str = tokenizer.decode(idx.item())
                results.append({
                    "token": token_str,
                    "logit": logit.item(),
                    "id": idx.item()
                })
                
        return jsonify({"logits": results})
    except Exception as e:
        print(f"Error during inference: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(debug=True, port=8002)
