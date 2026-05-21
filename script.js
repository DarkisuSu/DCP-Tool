// script.js - DCP-Tool Dynamic "Hello World" Portal

document.addEventListener('DOMContentLoaded', () => {
    // -----------------------------------------------------------------
    // 1. Diagnostics Panel Live Updates
    // -----------------------------------------------------------------
    const diagTimeEl = document.getElementById('diag-time');
    const diagPlatformEl = document.getElementById('diag-platform');

    // Live clock update
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
    // 2. Multi-Language Greeting Cycle
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

    // Transition greeting text with elegant fade and scale
    function changeGreeting(event) {
        interactionCount++;
        counterValEl.textContent = interactionCount;
        if (interactionCount === 1) {
            pulseCounterContainer.style.display = 'block';
        }

        // Get button center for canvas particle explosion
        const rect = btnInteract.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        createExplosion(x, y);

        // Move to next greeting (random but not the same as current)
        let nextIndex;
        do {
            nextIndex = Math.floor(Math.random() * greetings.length);
        } while (nextIndex === currentGreetIndex);
        
        currentGreetIndex = nextIndex;
        const newGreet = greetings[currentGreetIndex];

        // Animate text transition
        greetingTitle.style.opacity = '0';
        greetingTitle.style.transform = 'scale(0.95)';
        
        setTimeout(() => {
            greetingTitle.textContent = newGreet.text;
            greetingTitle.style.opacity = '1';
            greetingTitle.style.transform = 'scale(1)';
            btnText.textContent = `Say Hello in ${greetings[(currentGreetIndex + 1) % greetings.length].lang}`;
        }, 250);
    }

    btnInteract.addEventListener('click', changeGreeting);


    // -----------------------------------------------------------------
    // 3. Canvas Particles Engine
    // -----------------------------------------------------------------
    const canvas = document.getElementById('particles-canvas');
    const ctx = canvas.getContext('2d');

    let particles = [];
    let width = canvas.width = window.innerWidth;
    let height = canvas.height = window.innerHeight;

    window.addEventListener('resize', () => {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
    });

    class Particle {
        constructor(x, y, isExplosion = false, color = null) {
            this.x = x || Math.random() * width;
            this.y = y || Math.random() * height;
            this.isExplosion = isExplosion;
            
            if (isExplosion) {
                // High speed spreading for explosions
                const angle = Math.random() * Math.PI * 2;
                const speed = 1 + Math.random() * 6;
                this.vx = Math.cos(angle) * speed;
                this.vy = Math.sin(angle) * speed;
                this.size = 2 + Math.random() * 4;
                this.alpha = 1;
                this.color = color || `hsl(${Math.random() * 360}, 90%, 65%)`;
                this.life = 60 + Math.random() * 40;
                this.decay = 1 / this.life;
            } else {
                // Gentle floating background particles
                this.vx = (Math.random() - 0.5) * 0.3;
                this.vy = (Math.random() - 0.5) * 0.3;
                this.size = 1 + Math.random() * 2.5;
                this.alpha = 0.15 + Math.random() * 0.3;
                this.color = Math.random() > 0.5 ? 'hsl(270, 95%, 70%)' : 'hsl(185, 100%, 50%)';
            }
        }

        update() {
            this.x += this.vx;
            this.y += this.vy;

            if (this.isExplosion) {
                this.alpha -= this.decay;
                this.vy += 0.05; // gravity for explosion particles
                this.vx *= 0.98; // friction
            } else {
                // Wrap around background particles
                if (this.x < 0) this.x = width;
                if (this.x > width) this.x = 0;
                if (this.y < 0) this.y = height;
                if (this.y > height) this.y = 0;
            }
        }

        draw() {
            ctx.save();
            ctx.globalAlpha = this.alpha;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fillStyle = this.color;
            // Glowing effect
            if (this.isExplosion) {
                ctx.shadowBlur = 10;
                ctx.shadowColor = this.color;
            }
            ctx.fill();
            ctx.restore();
        }
    }

    // Initialize gentle background particles
    const initBgParticles = () => {
        const count = Math.min(60, Math.floor((width * height) / 15000));
        for (let i = 0; i < count; i++) {
            particles.push(new Particle());
        }
    };
    initBgParticles();

    // Create dynamic explosion of particles
    function createExplosion(x, y) {
        const count = 35;
        // Use current theme colors for explosion
        const colors = [
            'hsl(270, 95%, 68%)', // primary
            'hsl(185, 100%, 48%)', // secondary
            'hsl(325, 95%, 60%)'  // accent
        ];
        for (let i = 0; i < count; i++) {
            const color = colors[Math.floor(Math.random() * colors.length)];
            particles.push(new Particle(x, y, true, color));
        }
    }

    // Animation Loop
    function animate() {
        ctx.clearRect(0, 0, width, height);

        // Update and draw particles
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.update();
            p.draw();

            // Remove expired explosion particles
            if (p.isExplosion && p.alpha <= 0) {
                particles.splice(i, 1);
            }
        }

        // Keep standard background count constant
        const bgParticlesCount = particles.filter(p => !p.isExplosion).length;
        const targetBgCount = Math.min(60, Math.floor((width * height) / 15000));
        if (bgParticlesCount < targetBgCount) {
            particles.push(new Particle());
        }

        requestAnimationFrame(animate);
    }
    animate();
});
