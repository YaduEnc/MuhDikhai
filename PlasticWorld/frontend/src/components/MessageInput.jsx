import { useState, useRef, useEffect } from 'react';
import { startTyping, stopTyping } from '../services/socketService';
import './MessageInput.css';

function MessageInput({ onSend, disabled, recipientId }) {
  const [message, setMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const textareaRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      if (recipientId && isTyping) {
        stopTyping(recipientId);
      }
    };
  }, [recipientId, isTyping]);

  const handleChange = (e) => {
    const value = e.target.value;
    setMessage(value);

    // Handle typing indicators
    if (recipientId) {
      if (!isTyping && value.trim()) {
        setIsTyping(true);
        startTyping(recipientId);
      }

      // Clear existing timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      // Stop typing after 3 seconds of inactivity
      typingTimeoutRef.current = setTimeout(() => {
        if (isTyping) {
          setIsTyping(false);
          stopTyping(recipientId);
        }
      }, 3000);
    }

    // Auto-resize textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!message.trim() || disabled) return;

    // Stop typing
    if (isTyping && recipientId) {
      setIsTyping(false);
      stopTyping(recipientId);
    }

    onSend(message);
    setMessage('');

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="message-input-container">
      <form onSubmit={handleSubmit} className="message-input-form">
        <textarea
          ref={textareaRef}
          className="message-input"
          value={message}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          rows={1}
          disabled={disabled}
        />
        <button
          type="submit"
          className="btn-send"
          disabled={!message.trim() || disabled}
        >
          {disabled ? 'Sending...' : 'Send'}
        </button>
      </form>
    </div>
  );
}

export default MessageInput;
