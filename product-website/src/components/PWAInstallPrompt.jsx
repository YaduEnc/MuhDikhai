import React, { useState, useEffect } from 'react';

const PWAInstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later.
      setDeferredPrompt(e);
      // Update UI notify the user they can install the PWA
      setIsVisible(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    
    // Show the install prompt
    deferredPrompt.prompt();
    
    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response to the install prompt: ${outcome}`);
    
    // We've used the prompt, and can't use it again, throw it away
    setDeferredPrompt(null);
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="pwa-install-banner">
      <div className="pwa-content">
        <div className="pwa-icon-mini">
          <img src="/icon-192.png" alt="App Icon" />
        </div>
        <div className="pwa-text">
          <h3>Install MuhDikhai</h3>
          <p>Talk to strangers with a premium native experience</p>
        </div>
      </div>
      <div className="pwa-actions">
        <button className="pwa-install-btn" onClick={handleInstallClick}>
          INSTALL
        </button>
        <button className="pwa-close-btn" onClick={() => setIsVisible(false)}>
          ✕
        </button>
      </div>
    </div>
  );
};

export default PWAInstallPrompt;
