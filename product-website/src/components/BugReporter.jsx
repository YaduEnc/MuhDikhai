import React, { useState, useEffect } from 'react';
import html2canvas from 'html2canvas';
import './BugReporter.css';

const BugReporter = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [screenshot, setScreenshot] = useState(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState({ type: '', message: '' });

  // Expose global function to open reporter
  useEffect(() => {
    window.openBugReporter = () => setIsOpen(true);
    return () => {
      delete window.openBugReporter;
    };
  }, []);

  const handleCapture = async () => {
    setIsCapturing(true);
    setStatus({ type: '', message: '' });
    
    try {
      // Temporarily hide the bug reporter overlay so it's not in the screenshot itself
      const reporterOverlay = document.getElementById('bug-reporter-overlay');
      if (reporterOverlay) reporterOverlay.style.visibility = 'hidden';

      const canvas = await html2canvas(document.body, {
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#0a0a0f', // Match app background
      });
      
      if (reporterOverlay) reporterOverlay.style.visibility = 'visible';

      const base64Image = canvas.toDataURL('image/jpeg', 0.8);
      setScreenshot(base64Image);
    } catch (err) {
      console.error('Failed to capture screenshot', err);
      setStatus({ type: 'error', message: 'Failed to capture screen. You can still submit text.' });
    } finally {
      setIsCapturing(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title || !description) {
      setStatus({ type: 'error', message: 'Title and description are required.' });
      return;
    }

    setIsSubmitting(true);
    setStatus({ type: '', message: '' });

    try {
      const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
      
      const payload = {
        title,
        description,
        screenshotBase64: screenshot,
        deviceInfo: {
          userAgent: navigator.userAgent,
          url: window.location.href,
          screenResolution: `${window.innerWidth}x${window.innerHeight}`,
        }
      };

      const res = await fetch(`${BACKEND_URL}/api/v1/bugs/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setStatus({ type: 'success', message: 'Bug reported successfully!' });
        setTimeout(() => {
          handleClose();
        }, 2000);
      } else {
        setStatus({ type: 'error', message: data.error || 'Submission failed' });
      }
    } catch (err) {
      console.error('API Error', err);
      setStatus({ type: 'error', message: 'Network error occurred.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setTitle('');
    setDescription('');
    setScreenshot(null);
    setStatus({ type: '', message: '' });
  };

  if (!isOpen) {
    return (
      <button 
        className="floating-bug-btn" 
        onClick={() => setIsOpen(true)}
        title="Report a Bug"
      >
        🐛
      </button>
    );
  }

  return (
    <div className="bug-reporter-overlay" id="bug-reporter-overlay">
      <div className="bug-reporter-modal">
        <div className="modal-header">
          <h2>Report an Issue</h2>
          <button className="close-btn" onClick={handleClose}>×</button>
        </div>
        
        <form onSubmit={handleSubmit} className="bug-form">
          <div className="form-group">
            <label>Issue Title</label>
            <input 
              type="text" 
              placeholder="E.g., Matchmaking button not working" 
              value={title}
              onChange={e => setTitle(e.target.value)}
              required
            />
          </div>
          
          <div className="form-group">
            <label>Description & Steps to Reproduce</label>
            <textarea 
              placeholder="What happened? What were you trying to do?" 
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={4}
              required
            />
          </div>

          <div className="screenshot-section">
            <div className="screenshot-header">
              <label>Screenshot</label>
              <button 
                type="button" 
                onClick={handleCapture} 
                disabled={isCapturing}
                className="capture-btn"
              >
                {isCapturing ? 'Capturing...' : (screenshot ? 'Retake Screenshot' : 'Capture Screen')}
              </button>
            </div>
            
            {screenshot ? (
              <div className="screenshot-preview">
                <img src={screenshot} alt="Captured Screen" />
                <button type="button" className="remove-screenshot" onClick={() => setScreenshot(null)}>×</button>
              </div>
            ) : (
              <div className="screenshot-placeholder">
                <p>No screenshot attached. Click above to capture your current view.</p>
              </div>
            )}
          </div>

          {status.message && (
            <div className={`status-message ${status.type}`}>
              {status.message}
            </div>
          )}

          <div className="form-actions">
            <button type="button" className="btn-cancel" onClick={handleClose}>Cancel</button>
            <button type="submit" className="btn-submit" disabled={isSubmitting}>
              {isSubmitting ? 'Submitting...' : 'Submit Report'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default BugReporter;
