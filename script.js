// Initialize Lucide Icons
lucide.createIcons();
document.getElementById('currentYear').textContent = new Date().getFullYear();

// ------------------------------------------
// MODULE: /js/config.js
// ------------------------------------------
const Config = {
    API_BASE_URL: "http://localhost:8000",
    CHAT_ENDPOINT: "/chat",
    MAX_RETRIES: 3,
    TIMEOUT_MS: 10000,
    USE_MOCK: true // Set to false when connecting to the real Python backend
};

// ------------------------------------------
// MODULE: /js/utils.js
// ------------------------------------------
const Utils = {
    generateUUID() {
        // Fallback for crypto.randomUUID if needed, but modern browsers support it.
        return window.crypto && crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    },
    sanitizeHTML(str) {
        const temp = document.createElement('div');
        temp.textContent = str;
        return temp.innerHTML;
    }
};

// ------------------------------------------
// MODULE: /js/stateManager.js
// ------------------------------------------
const StateManager = {
    state: {
        conversation_id: Utils.generateUUID(),
        status: 'idle', // 'idle', 'loading', 'error', 'connected'
        isOpen: false,
        isInitialized: false
    },
    setStatus(newStatus) {
        this.state.status = newStatus;
        ChatUI.updateUIState();
    }
};

// ------------------------------------------
// MODULE: /js/chatService.js
// (Data Layer - Isolated from UI)
// ------------------------------------------
const ChatService = {
    async sendMessage(messageText) {
        const payload = {
            message: messageText,
            conversation_id: StateManager.state.conversation_id,
            metadata: {
                role: "recruiter",
                client_timestamp: new Date().toISOString()
            }
        };

        // Execução do Mock (Para desenvolvimento frontend)
        if (Config.USE_MOCK) {
            return this._mockResponse(messageText);
        }

        // Execução Real com Retry Exponencial e Timeout
        return this._fetchWithRetry(`${Config.API_BASE_URL}${Config.CHAT_ENDPOINT}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    },

    async _fetchWithRetry(url, options, retries = Config.MAX_RETRIES) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), Config.TIMEOUT_MS);
            options.signal = controller.signal;
            
            const response = await fetch(url, options);
            clearTimeout(timeoutId);
            
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return await response.json();
        } catch (error) {
            if (retries > 0) {
                console.warn(`[ChatService] Retrying API call... attempts left: ${retries - 1}`);
                const backoffTime = Math.pow(2, Config.MAX_RETRIES - retries) * 1000;
                await new Promise(r => setTimeout(r, backoffTime));
                return this._fetchWithRetry(url, options, retries - 1);
            }
            throw error;
        }
    },

    // Mock Data for UX fidelity before backend integration
    async _mockResponse(userMsg) {
        return new Promise(resolve => {
            setTimeout(() => {
                let aiReply = "A arquitetura está preparada para me conectar ao backend via REST em breve. Por enquanto, posso adiantar que Henrique é especialista em projetar sistemas LLM auditáveis, especialmente usando LangGraph e Pydantic.";
                
                const lowerMsg = userMsg.toLowerCase();
                if(lowerMsg.includes("escala") || lowerMsg.includes("scale")) {
                    aiReply = "Sobre escala: Na Omni Saúde, o sistema lida com +60.000 conversas por mês. Henrique utilizou FastAPI e Async I/O para garantir alta concorrência sem bloqueio de thread, suportando picos de tráfego com latência mínima.";
                } else if(lowerMsg.includes("arquitetura") || lowerMsg.includes("architecture")) {
                    aiReply = "A principal filosofia arquitetural do Henrique é 'Determinismo sobre Probabilidade'. Ele não faz apenas chamadas à API da OpenAI; ele constrói guardrails estritos usando Domain-Driven Design e validações tipadas para garantir outputs seguros.";
                } else if(lowerMsg.includes("omni")) {
                    aiReply = "Na Omni Saúde, o grande impacto foi aumentar a resolução autônoma de tickets de 55% para 88%, reduzindo drasticamente a carga da equipe humana. Tudo isso com um fluxo Human-in-the-Loop em um ambiente altamente regulado.";
                }

                resolve({
                    reply: aiReply,
                    conversation_id: StateManager.state.conversation_id,
                    confidence: 0.99
                });
            }, 1200 + Math.random() * 800); // Simulate network latency
        });
    }
};

// ------------------------------------------
// MODULE: /js/chatUI.js
// (View Layer - DOM Manipulation Only)
// ------------------------------------------
const ChatUI = {
    elements: {
        widget: document.getElementById('chat-widget'),
        history: document.getElementById('chat-history'),
        input: document.getElementById('chat-input'),
        form: document.getElementById('chat-form'),
        sendBtn: document.getElementById('chat-send-btn'),
        typingIndicator: document.getElementById('typing-indicator'),
        toggleBtn: document.getElementById('chat-toggle-btn')
    },

    init() {
        if(StateManager.state.isInitialized) return;
        
        // Add Initial Context Message
        this.renderMessage("Hi! I'm Le, Henrique's AI assistant. I'm connected to his knowledge base. What would you like to know about his system architectures, production metrics, or tech stack?", 'bot');
        
        // Add Quick Prompts
        this.renderQuickPrompts([
            "Como você escala sistemas?",
            "Fale da arquitetura na Omni Saúde",
            "Qual o seu foco em GenAI?"
        ]);

        StateManager.state.isInitialized = true;
    },

    toggleChat() {
        const isHidden = this.elements.widget.classList.contains('hidden-chat');
        if (isHidden) {
            this.elements.widget.classList.remove('hidden-chat');
            this.elements.widget.classList.add('visible-chat');
            StateManager.state.isOpen = true;
            this.init(); // Initialize on first open
            setTimeout(() => this.elements.input.focus(), 300);
        } else {
            this.elements.widget.classList.add('hidden-chat');
            this.elements.widget.classList.remove('visible-chat');
            StateManager.state.isOpen = false;
        }
    },

    async handleSubmit(e) {
        e.preventDefault();
        const text = this.elements.input.value.trim();
        if (!text || StateManager.state.status === 'loading') return;

        const sanitizedText = Utils.sanitizeHTML(text);
        
        // 1. Render User Message
        this.renderMessage(sanitizedText, 'user');
        this.elements.input.value = '';
        this.removeQuickPrompts(); // Clear buttons after first interaction

        // 2. Set Loading State
        StateManager.setStatus('loading');

        try {
            // 3. Call Service
            const response = await ChatService.sendMessage(sanitizedText);
            
            // 4. Render AI Reply
            this.renderMessage(response.reply, 'bot');
        } catch (error) {
            console.error("Chat Error:", error);
            this.renderMessage("Oops. Ocorreu um erro ao comunicar com o servidor de inferência. A conexão deve ser restaurada em breve.", 'system');
        } finally {
            StateManager.setStatus('idle');
        }
    },

    sendQuickPrompt(text) {
        this.elements.input.value = text;
        this.elements.form.dispatchEvent(new Event('submit'));
    },

    renderMessage(text, sender) {
        const wrapperDiv = document.createElement('div');
        wrapperDiv.className = `flex ${sender === 'user' ? 'justify-end' : 'justify-start'}`;

        const innerDiv = document.createElement('div');
        
        if (sender === 'user') {
            innerDiv.className = 'bg-cyan-600 text-slate-100 rounded-2xl rounded-tr-sm px-4 py-3 max-w-[85%] text-sm shadow-md';
        } else if (sender === 'bot') {
            innerDiv.className = 'bg-slate-800 text-slate-200 rounded-2xl rounded-tl-sm px-4 py-3 max-w-[85%] text-sm border border-slate-700 shadow-md leading-relaxed';
        } else {
            // System error
            innerDiv.className = 'bg-red-950/50 text-red-400 rounded-lg px-4 py-2 text-xs border border-red-900/50 text-center w-full';
        }

        innerDiv.innerHTML = text; // Text is sanitized before passing to this function
        wrapperDiv.appendChild(innerDiv);
        
        this.elements.history.appendChild(wrapperDiv);
        this.scrollToBottom();
    },

    renderQuickPrompts(prompts) {
        const container = document.createElement('div');
        container.className = "flex flex-wrap gap-2 mt-2 quick-prompts-container";
        
        prompts.forEach(prompt => {
            const btn = document.createElement('button');
            btn.className = "text-xs border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 px-3 py-1.5 rounded-full transition-colors font-medium";
            btn.textContent = prompt;
            btn.onclick = () => this.sendQuickPrompt(prompt);
            container.appendChild(btn);
        });

        this.elements.history.appendChild(container);
        this.scrollToBottom();
    },

    removeQuickPrompts() {
        const container = document.querySelector('.quick-prompts-container');
        if(container) container.remove();
    },

    updateUIState() {
        const isLoading = StateManager.state.status === 'loading';
        
        // Toggle Typing Indicator
        this.elements.typingIndicator.style.display = isLoading ? 'block' : 'none';
        
        // Toggle Input State
        this.elements.input.disabled = isLoading;
        this.elements.sendBtn.disabled = isLoading;
        
        if (isLoading) {
            this.elements.sendBtn.classList.replace('bg-cyan-600', 'bg-slate-700');
            this.elements.sendBtn.classList.replace('text-slate-950', 'text-slate-500');
            this.scrollToBottom();
        } else {
            this.elements.sendBtn.classList.replace('bg-slate-700', 'bg-cyan-600');
            this.elements.sendBtn.classList.replace('text-slate-500', 'text-slate-950');
            setTimeout(() => this.elements.input.focus(), 10);
        }
    },

    scrollToBottom() {
        this.elements.history.scrollTop = this.elements.history.scrollHeight;
    }
};

// ------------------------------------------
// MODULE: /js/portfolioCore.js
// ------------------------------------------
const Portfolio = {
    init() {
        window.addEventListener('scroll', this.handleScroll.bind(this));
        this.handleScroll(); // initial check
    },
    
    handleScroll() {
        const navbar = document.getElementById('navbar');
        if (window.scrollY > 50) {
            navbar.classList.add('bg-slate-950/80', 'backdrop-blur-md', 'border-slate-800', 'py-4');
            navbar.classList.remove('bg-transparent', 'border-transparent', 'py-6');
        } else {
            navbar.classList.add('bg-transparent', 'border-transparent', 'py-6');
            navbar.classList.remove('bg-slate-950/80', 'backdrop-blur-md', 'border-slate-800', 'py-4');
        }
    },

    scrollTo(id) {
        const element = document.getElementById(id);
        if (element) {
            const offset = 80; // account for fixed header
            const bodyRect = document.body.getBoundingClientRect().top;
            const elementRect = element.getBoundingClientRect().top;
            const elementPosition = elementRect - bodyRect;
            const offsetPosition = elementPosition - offset;

            window.scrollTo({
                top: offsetPosition,
                behavior: 'smooth'
            });
        }
    }
};

// Bootstrapping
document.addEventListener('DOMContentLoaded', () => {
    Portfolio.init();
});
