// script.js - DCP-Tool Ultra-Minimalist High-Performance Client Script

document.addEventListener('DOMContentLoaded', () => {
    // -----------------------------------------------------------------
    // 1. Diagnostics Panel Live Updates
    // -----------------------------------------------------------------
    const diagTimeEl = document.getElementById('diag-time');
    const diagPlatformEl = document.getElementById('diag-platform');

    // Live clock update (extremely low cost, running only once per second)
    function updateClock() {
        const now = new Date();
        let hours = now.getHours();
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12; // the hour '0' should be '12'
        const hoursStr = String(hours).padStart(2, '0');
        
        diagTimeEl.textContent = `${hoursStr}:${minutes}:${seconds} ${ampm}`;
    }
    updateClock();
    setInterval(updateClock, 1000);

    // Simple platform string parser
    function detectPlatform() {
        const ua = navigator.userAgent;
        let os = "Unknown OS";
        let browser = "Unknown Browser";

        // Detect OS
        if (ua.indexOf("Win") !== -1) os = "Windows";
        else if (ua.indexOf("Mac") !== -1) os = "macOS";
        else if (ua.indexOf("Linux") !== -1) os = "Linux";
        else if (ua.indexOf("Android") !== -1) os = "Android";
        else if (ua.indexOf("like Mac") !== -1) os = "iOS";

        // Detect Browser
        if (ua.indexOf("Chrome") !== -1) browser = "Chrome";
        else if (ua.indexOf("Safari") !== -1) browser = "Safari";
        else if (ua.indexOf("Firefox") !== -1) browser = "Firefox";
        else if (ua.indexOf("MSIE") !== -1 || !!document.documentMode === true) browser = "IE";
        else if (ua.indexOf("Edge") !== -1) browser = "Edge";

        diagPlatformEl.textContent = `${os} (${browser})`;
    }
    detectPlatform();


    // -----------------------------------------------------------------
    // 2. Multi-Language Greeting Cycle (Instant transitions, zero GPU layout cost)
    // -----------------------------------------------------------------
    const greetings = [
        { text: "Hello, World!", lang: "English" },
        { text: "你好，世界！", lang: "Chinese" },
        { text: "¡Hola, Mundo!", lang: "Spanish" },
        { text: "Bonjour, le Monde!", lang: "French" },
        { text: "Hallo, Welt!", lang: "German" },
        { text: "Ciao, Mondo!", lang: "Italian" },
        { text: "Olá, Mundo!", lang: "Portuguese" },
        { text: "こんにちは、世界！", lang: "Japanese" },
        { text: "안녕하세요, 세상!", lang: "Korean" },
        { text: "Привет, мир!", lang: "Russian" },
        { text: "Hej, Världen!", lang: "Swedish" },
        { text: "Namaste, Duniya!", lang: "Hindi" }
    ];

    let currentGreetIndex = 0;
    const greetingTitle = document.getElementById('greeting-title');
    const btnInteract = document.getElementById('btn-interact');
    const btnText = document.getElementById('btn-text');
    const pulseCounterContainer = document.getElementById('pulse-counter-container');
    const counterValEl = document.getElementById('counter-val');
    let interactionCount = 0;

    function changeGreeting() {
        interactionCount++;
        counterValEl.textContent = interactionCount;
        if (interactionCount === 1) {
            pulseCounterContainer.style.display = 'block';
        }

        // Cycle index
        let nextIndex;
        do {
            nextIndex = Math.floor(Math.random() * greetings.length);
        } while (nextIndex === currentGreetIndex);
        
        currentGreetIndex = nextIndex;
        const newGreet = greetings[currentGreetIndex];

        // Instant text swap (prevents rendering engine layout-shifts and GPU paint trigger)
        greetingTitle.textContent = newGreet.text;
        btnText.textContent = `Say Hello in ${greetings[(currentGreetIndex + 1) % greetings.length].lang}`;
    }

    btnInteract.addEventListener('click', changeGreeting);
});
