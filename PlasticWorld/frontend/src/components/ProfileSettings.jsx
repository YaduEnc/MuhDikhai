import { useState, useEffect } from 'react';
import { getUserProfile, updateProfile } from '../services/userService';
import { getCurrentUser } from '../services/authService';
import './ProfileSettings.css';

function ProfileSettings() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    username: '',
    bio: '',
    phoneNumber: '',
    profilePictureUrl: '',
  });

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    setLoading(true);
    try {
      const userData = await getUserProfile();
      setUser(userData);
      setFormData({
        name: userData.name || '',
        username: userData.username || '',
        bio: userData.bio || '',
        phoneNumber: userData.phoneNumber || '',
        profilePictureUrl: userData.profilePictureUrl || '',
      });
    } catch (error) {
      console.error('Load user error:', error);
      // Fallback to localStorage
      const localUser = getCurrentUser();
      if (localUser) {
        setUser(localUser);
        setFormData({
          name: localUser.name || '',
          username: localUser.username || '',
          bio: localUser.bio || '',
          phoneNumber: localUser.phoneNumber || '',
          profilePictureUrl: localUser.profilePictureUrl || '',
        });
      }
      setError('Failed to load profile. Using cached data.');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    setError(null);
    setSuccess(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      // Build update data - only include fields that have values
      // Don't send empty strings - let backend handle undefined for optional fields
      const updateData = {};
      
      // Name: only send if it has a value
      if (formData.name !== undefined && formData.name.trim()) {
        updateData.name = formData.name.trim();
      }
      
      // Username: only send if it has a value (must be at least 3 chars)
      if (formData.username !== undefined && formData.username.trim()) {
        const trimmed = formData.username.trim();
        if (trimmed.length >= 3) {
          updateData.username = trimmed;
        } else if (trimmed.length > 0) {
          throw new Error('Username must be at least 3 characters');
        }
        // If empty, don't send it (don't try to clear username)
      }
      
      // Bio: only send if it has a value or is explicitly being cleared
      if (formData.bio !== undefined) {
        const trimmed = formData.bio.trim();
        // Send empty string to clear bio
        updateData.bio = trimmed;
      }
      
      // Phone: only send if it has a value (must be +91 followed by 10 digits)
      if (formData.phoneNumber !== undefined && formData.phoneNumber.trim()) {
        const trimmed = formData.phoneNumber.trim();
        // Validate +91 followed by exactly 10 digits
        if (!/^\+91\d{10}$/.test(trimmed)) {
          throw new Error('Phone number must be 10 digits (e.g., +911234567890)');
        }
        updateData.phoneNumber = trimmed;
      }
      // If phone is empty, don't send it (don't try to clear phone)
      
      // Profile Picture URL: only send if it has a value (must be valid URL)
      if (formData.profilePictureUrl !== undefined && formData.profilePictureUrl.trim()) {
        const trimmed = formData.profilePictureUrl.trim();
        try {
          new URL(trimmed); // Validate URL
          updateData.profilePictureUrl = trimmed;
        } catch {
          throw new Error('Profile picture URL must be a valid URL');
        }
      }
      // If URL is empty, don't send it (don't try to clear URL)

      const updatedUser = await updateProfile(updateData);
      setUser(updatedUser);
      setFormData({
        name: updatedUser.name || '',
        username: updatedUser.username || '',
        bio: updatedUser.bio || '',
        phoneNumber: updatedUser.phoneNumber || '',
        profilePictureUrl: updatedUser.profilePictureUrl || '',
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      // Better error handling
      console.error('Full error:', err);
      console.error('Error response:', err.response?.data);
      
      // Check for validation errors (from validateBody middleware)
      if (err.response?.data?.error?.details) {
        const validationErrors = err.response.data.error.details
          .map(e => `${e.field}: ${e.message}`)
          .join(', ');
        setError(`Validation failed: ${validationErrors}`);
      } else {
        const errorMessage = err.response?.data?.error?.message ||
                            err.response?.data?.message ||
                            err.message || 
                            'Failed to update profile';
        setError(errorMessage);
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="profile-loading">Loading profile...</div>;
  }

  return (
    <div className="profile-settings">
      <h2>Profile Settings</h2>
      
      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">Profile updated successfully!</div>}

      <form onSubmit={handleSubmit} className="profile-form">
        <div className="form-group">
          <label htmlFor="name">Name</label>
          <input
            type="text"
            id="name"
            name="name"
            value={formData.name}
            onChange={handleChange}
            placeholder="Your full name"
          />
        </div>

        <div className="form-group">
          <label htmlFor="username">Username</label>
          <input
            type="text"
            id="username"
            name="username"
            value={formData.username}
            onChange={handleChange}
            placeholder="username"
          />
        </div>

        <div className="form-group">
          <label htmlFor="bio">Bio</label>
          <textarea
            id="bio"
            name="bio"
            value={formData.bio}
            onChange={handleChange}
            placeholder="Tell us about yourself"
            rows="4"
          />
        </div>

        <div className="form-group">
          <label htmlFor="phoneNumber">Phone Number</label>
          <div className="phone-input-wrapper">
            <span className="phone-prefix">+91</span>
            <input
              type="tel"
              id="phoneNumber"
              name="phoneNumber"
              value={formData.phoneNumber.replace(/^\+91/, '')}
              onChange={(e) => {
                // Only allow digits, max 10 digits
                const value = e.target.value.replace(/\D/g, '').slice(0, 10);
                setFormData(prev => ({
                  ...prev,
                  phoneNumber: value ? `+91${value}` : ''
                }));
                setError(null);
                setSuccess(false);
              }}
              placeholder="1234567890"
              maxLength={10}
            />
          </div>
          <small className="form-hint">Enter 10-digit mobile number</small>
        </div>

        <div className="form-group">
          <label htmlFor="profilePictureUrl">Profile Picture URL</label>
          <input
            type="url"
            id="profilePictureUrl"
            name="profilePictureUrl"
            value={formData.profilePictureUrl}
            onChange={handleChange}
            placeholder="https://example.com/photo.jpg"
          />
        </div>

        <div className="form-actions">
          <button type="submit" className="btn-save" disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>

      {user && (
        <div className="profile-preview">
          <h3>Preview</h3>
          <div className="preview-card">
            <div className="preview-avatar">
              {formData.profilePictureUrl ? (
                <img src={formData.profilePictureUrl} alt="Profile" />
              ) : (
                <div className="avatar-placeholder">
                  {formData.name?.[0]?.toUpperCase() || formData.username?.[0]?.toUpperCase() || 'U'}
                </div>
              )}
            </div>
            <div className="preview-info">
              <h4>{formData.name || formData.username || 'Your Name'}</h4>
              <p>@{formData.username || 'username'}</p>
              {formData.bio && <p className="bio">{formData.bio}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProfileSettings;
