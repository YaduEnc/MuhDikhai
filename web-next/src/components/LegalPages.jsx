import { useState } from 'react'

export default function LegalPages({ onClose, initialTab = 'privacy' }) {
    const [activeTab, setActiveTab] = useState(initialTab)

    const tabs = [
        { id: 'privacy', label: 'Privacy Policy' },
        { id: 'terms', label: 'Terms of Service' },
        { id: 'safety', label: 'Safety Guidelines' }
    ]

    return (
        <div className="legal-portal">
            <div className="legal-backdrop" onClick={onClose} />
            <div className="legal-sheet">
                <header className="legal-header">
                    <div className="legal-header-top">
                        <button className="legal-close" onClick={onClose}>← Back</button>
                        <div className="legal-brand">MUHDIKHAI</div>
                    </div>
                    <nav className="legal-tabs">
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                className={`legal-tab-btn ${activeTab === tab.id ? 'is-active' : ''}`}
                                onClick={() => setActiveTab(tab.id)}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </nav>
                </header>

                <div className="legal-content">
                    {activeTab === 'privacy' && (
                        <div className="legal-body animate-fade-up">
                            <h2>Privacy is Our Core</h2>
                            <p>We believe in the "Gayi Bhains Paani Mein" philosophy. Once you leave, you leave. No logs. No history.</p>

                            <h3>1. Information We Collect</h3>
                            <p>We collect your basic Google profile (Name, Email, Profile Picture) during login. This is solely to maintain your Aura points and identity within the community. We do NOT sell or share this data.</p>

                            <h3>2. Chat History</h3>
                            <p>By default, all random chats are ephemeral. Once either party leaves the room, the session is shredded on our servers. Nothing is stored long-term unless manually triggered in "Vanish-OFF" mode (not yet launched).</p>

                            <h3>3. WebRTC & Peer Connections</h3>
                            <p>For calls, we use secure WebRTC signaling. We do not listen to, record, or snoop on your private streams. Your calls are between you and the other stranger.</p>

                            <h3>4. Cookies</h3>
                            <p>We use essential cookies to keep you signed in. No tracking pixels. No invasive analytics.</p>
                        </div>
                    )}

                    {activeTab === 'terms' && (
                        <div className="legal-body animate-fade-up">
                            <h2>The Rules of Chaos</h2>
                            <p>By entering "The Madness", you agree to play by these basic rules. Break them, and you go to the Troll Pool.</p>

                            <h3>1. Acceptance</h3>
                            <p>By using Muhdikhai, you acknowledge that you are at least 18 years of age. This platform contains unfiltered interactions.</p>

                            <h3>2. Prohibited Conduct</h3>
                            <p>No illegal activities. No distribution of non-consensual explicit material. No hate speech that targets protected groups. If your Aura points drop too low from reports, you will be shadow-banned.</p>

                            <h3>3. Your Responsibilities</h3>
                            <p>You are responsible for what you say. Muhdikhai is a tool; what you do with it is on you. Stay safe, stay smart.</p>

                            <h3>4. Termination</h3>
                            <p>We reserve the right to ban any account that negatively affects the "vibe" of the community through toxicity or spamming.</p>
                        </div>
                    )}

                    {activeTab === 'safety' && (
                        <div className="legal-body animate-fade-up">
                            <h2>Stay Safe, Seedha Mudde Pe</h2>
                            <p>Random chat can be intense. Don't let your guard down entirely.</p>

                            <ul className="legal-safety-list">
                                <li><strong>Never Share PI:</strong> Don't give out your WhatsApp, Address, or Real ID to someone you just met in 5 seconds.</li>
                                <li><strong>The Leave Button is your Friend:</strong> If someone makes you uncomfortable, just hit Leave. There's zero penalty for ghosting a weirdo.</li>
                                <li><strong>Aura Points Matter:</strong> If someone has a "Toxic" badge or low Aura, be careful. The community has already judged them.</li>
                                <li><strong>Report Toxicity:</strong> Use the Vibe Check at the end of every chat to let us know if someone was out of line.</li>
                            </ul>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
