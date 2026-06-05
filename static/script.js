const textInput = document.getElementById("text-input");
const chartDisplay = document.getElementById("chart-display");
const tempSlider = document.getElementById("temperature");
const tempVal = document.getElementById("temperature-val");
const topkSlider = document.getElementById("top-k");
const topkVal = document.getElementById("top-k-val");
const toppSlider = document.getElementById("top-p");
const toppVal = document.getElementById("top-p-val");
const missionCards = document.querySelectorAll(".mission-card");
const insightPanel = document.getElementById("insight-panel");
const insightTitle = document.getElementById("insight-title");
const insightText = document.getElementById("insight-text");
const insightTip = document.getElementById("insight-tip");
const tipLabel = document.getElementById("tip-label");
const tipContainer = document.querySelector(".prompt-tip");

let currentLogits = [];
let debounceTimer;

const missions = [
    {
        title: "The Probability Engine",
        text: "The capital of France is",
        insight: "An LLM doesn't just predict one word. It generates a raw score (logit) for every word in its vocabulary. These scores are converted into probabilities summing to 100%.",
        tip: "Notice how the top prediction has almost all the probability mass.",
        config: { t: 1.0, k: 50, p: 1.0 }
    },
    {
        title: "The Heat of the Moment",
        text: "I was walking down the street when suddenly I saw a",
        insight: "Temperature divides the logits before probability conversion. A Temperature of 1.0 is standard.",
        tip: "Slide the Temperature to 0.1 to make the model rigid, or slide it to 2.0 to flatten the distribution.",
        config: { t: 1.0, k: 50, p: 1.0 }
    },
    {
        title: "Absolute Chaos",
        text: "The secret to happiness is",
        insight: "When Temperature is extremely high, the original logits lose their power. All words become equally likely.",
        tip: "Slide Temperature to 5.0. The AI is now basically picking random words.",
        config: { t: 5.0, k: 50, p: 1.0 }
    },
    {
        title: "The Top-K Cutoff",
        text: "For breakfast, I usually eat",
        insight: "Top-K is the first hard filter in the pipeline. It deletes all options except the top K highest probabilities, acting as a strict safety net.",
        tip: "Crank Temperature to 5.0 to flatten the curve, then slide Top-K down to 6. Watch the tail disappear!",
        config: { t: 5.0, k: 50, p: 1.0 }
    },
    {
        title: "Nucleus Sampling",
        text: "If I could travel anywhere, I would go to",
        insight: "Top-P (Nucleus) is a dynamic scalpel applied AFTER Top-K. It sums up the probabilities of the surviving Top-K pool until it hits P, then deletes the rest.",
        tip: "Set Top-K to 10 and Top-P to 0.45. Watch Top-P dynamically slice the remaining pool based on confidence!",
        config: { t: 5.0, k: 10, p: 0.45 }
    },
    {
        title: "Determinism Challenge",
        text: "The quick brown fox jumps over the lazy",
        insight: "Let's test your decoding mastery! Adjust the sliders so that EXACTLY 3 words remain, and the probability of the top word is exactly 33.3% (or within 1%).",
        tip: "Reward: Rs. 50! Think about how Temperature flattens probabilities and Top-K restricts choices.",
        config: { t: 1.0, k: 50, p: 1.0 },
        isBoss: true
    }
];

function fetchLogits() {
    const text = textInput.value.trim();
    if (!text) {
        chartDisplay.innerHTML = "";
        return;
    }

    fetch("/api/logits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
    })
    .then(res => res.json())
    .then(data => {
        if (data.logits) {
            currentLogits = data.logits;
            updateChart();
        }
    })
    .catch(err => console.error("Error fetching logits:", err));
}

function updateChart() {
    if (!currentLogits.length) return;

    const T = parseFloat(tempSlider.value);
    const K = parseInt(topkSlider.value);
    const P = parseFloat(toppSlider.value);

    // 1. Apply Temperature
    let probs = currentLogits.map(item => {
        const scaledLogit = T === 0 ? item.logit * 1000 : item.logit / T;
        return { ...item, scaledLogit };
    });

    // Sort by logit descending to apply Top-K
    probs.sort((a, b) => b.scaledLogit - a.scaledLogit);

    // 2. Apply Top-K
    probs = probs.slice(0, K);

    // 3. Calculate Softmax over the Top-K
    const maxLogit = Math.max(...probs.map(p => p.scaledLogit));
    probs.forEach(p => p.exp = Math.exp(p.scaledLogit - maxLogit));
    let sumExp = probs.reduce((sum, p) => sum + p.exp, 0);
    probs.forEach(p => p.prob = p.exp / sumExp);

    // 4. Apply Top-P (Nucleus) over the normalized Top-K distribution
    let cumulativeProb = 0;
    let keepCount = 0;
    for (let i = 0; i < probs.length; i++) {
        cumulativeProb += probs[i].prob;
        keepCount++;
        if (cumulativeProb >= P) break;
    }
    probs = probs.slice(0, keepCount);

    // 5. Re-normalize after Top-P cut
    let finalSum = probs.reduce((sum, p) => sum + p.prob, 0);
    probs.forEach(p => p.finalProb = p.prob / finalSum);

    // Boss level check
    checkBossLevel(probs);

    // Render
    renderBars(probs);
}

function renderBars(probs) {
    chartDisplay.innerHTML = "";
    
    // Cap rendering to top 15 so UI doesn't lag/overflow heavily
    const renderProbs = probs.slice(0, 15);
    
    renderProbs.forEach(item => {
        const percentage = (item.finalProb * 100).toFixed(1);
        
        const container = document.createElement("div");
        container.className = "prob-bar-container";
        
        const tokenLabel = document.createElement("div");
        tokenLabel.className = "prob-token";
        tokenLabel.textContent = `"${item.token}"`;
        
        const barWrapper = document.createElement("div");
        barWrapper.className = "prob-bar-wrapper";
        
        const bar = document.createElement("div");
        bar.className = "prob-bar";
        bar.style.width = `${percentage}%`;
        
        const valLabel = document.createElement("div");
        valLabel.className = "prob-value";
        valLabel.textContent = `${percentage}%`;
        
        barWrapper.appendChild(bar);
        container.appendChild(tokenLabel);
        container.appendChild(barWrapper);
        container.appendChild(valLabel);
        
        chartDisplay.appendChild(container);
    });
}

function checkBossLevel(probs) {
    // Only check if mission 5 is active
    const activeMission = document.querySelector(".mission-card.active");
    if (!activeMission || activeMission.dataset.mission !== "5") return;

    if (probs.length === 3) {
        const topProb = probs[0].finalProb * 100;
        if (Math.abs(topProb - 33.3) <= 1.0) {
            tipLabel.innerHTML = "🎉 WINNER!";
            insightTip.innerHTML = "You forced a 3-way uniform tie! Reward: Rs. 50. Screenshot this and claim your prize!";
            tipContainer.classList.remove("challenge-mode");
            tipContainer.style.background = "rgba(16, 185, 129, 0.2)";
            tipContainer.style.borderLeftColor = "#10b981";
        }
    }
}

// Event Listeners
textInput.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(fetchLogits, 500);
});

[tempSlider, topkSlider, toppSlider].forEach(slider => {
    slider.addEventListener("input", (e) => {
        document.getElementById(`${e.target.id}-val`).textContent = e.target.value;
        updateChart();
    });
});

missionCards.forEach(card => {
    card.addEventListener("click", () => {
        missionCards.forEach(c => c.classList.remove("active"));
        card.classList.add("active");

        const mId = card.dataset.mission;
        const mission = missions[mId];

        insightTitle.textContent = mission.title;
        insightText.textContent = mission.insight;
        insightTip.textContent = mission.tip;
        
        if (mission.isBoss) {
            tipLabel.innerHTML = "🎯 Challenge:";
            tipContainer.classList.add("challenge-mode");
            tipContainer.style.background = "";
            tipContainer.style.borderLeftColor = "";
        } else {
            tipLabel.innerHTML = "🎓 Pro Tip:";
            tipContainer.classList.remove("challenge-mode");
            tipContainer.style.background = "";
            tipContainer.style.borderLeftColor = "";
        }
        
        insightPanel.classList.remove("hidden");

        // Set config
        tempSlider.value = mission.config.t;
        tempVal.textContent = mission.config.t;
        topkSlider.value = mission.config.k;
        topkVal.textContent = mission.config.k;
        toppSlider.value = mission.config.p;
        toppVal.textContent = mission.config.p;

        textInput.value = mission.text;
        fetchLogits();
    });
});

// Initial fetch
fetchLogits();
