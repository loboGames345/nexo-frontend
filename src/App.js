// src/App.js

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import Auth from './components/Auth';
import Chat from './components/Chat';
import ProfileUploader from './components/ProfileUploader';
import './App.css';

const API_URL = 'http://localhost:5000';

function App() {
  
  const [token, setToken] = useState(null);
  const [username, setUsername] = useState('');
  const [userId, setUserId] = useState(null);
  const [profilePicUrl, setProfilePicUrl] = useState('');
  const [bio, setBio] = useState('');

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isUserPanelOpen, setIsUserPanelOpen] = useState(false);
  
  const [showRequestSentModal, setShowRequestSentModal] = useState(false);
  const [requestSentToUser, setRequestSentToUser] = useState('');

  const [showInfoModal, setShowInfoModal] = useState(false);
  const [infoModalMessage, setInfoModalMessage] = useState('');

  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [pendingLoginData, setPendingLoginData] = useState(null);

  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  const [showProfileModal, setShowProfileModal] = useState(false);
  const [tempBio, setTempBio] = useState('');
  const [tempUsername, setTempUsername] = useState('');
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [isProfileLoading, setIsProfileLoading] = useState(false);

  const [theme, setTheme] = useState(localStorage.getItem('chat-theme') || 'light');
  
  const [socket, setSocket] = useState(null);
  const [userCount, setUserCount] = useState(0);
  const [onlineUsersMap, setOnlineUsersMap] = useState({});

  useEffect(() => {
    const storedToken = sessionStorage.getItem('chat-token');
    const storedUsername = sessionStorage.getItem('chat-username');
    const storedUserId = sessionStorage.getItem('chat-userId');
    const storedProfilePic = sessionStorage.getItem('chat-profilePic');
    const storedBio = sessionStorage.getItem('chat-bio');

    if (storedToken) {
      setToken(storedToken);
      setUsername(storedUsername);
      setUserId(storedUserId);
      setProfilePicUrl(storedProfilePic || 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png');
      setBio(storedBio || '¡Hola! Estoy usando Nexo.');
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('chat-theme', theme);
  }, [theme]);
  
  // --- SOCKET GLOBAL ---
  // Conectar siempre para recibir contador. Registrar usuario solo si hay token.
  useEffect(() => {
    const newSocket = io(API_URL);
    setSocket(newSocket);

    newSocket.on('updateUserCount', (count) => {
      setUserCount(count);
    });
    newSocket.on('updateOnlineUsers', (usersMap) => {
      setOnlineUsersMap(usersMap);
    });

    return () => {
      newSocket.disconnect();
    };
  }, []); // Se ejecuta una sola vez al montar la App

  // --- REGISTRO EN SOCKET ---
  // Este efecto corre cuando cambia userId o socket
  useEffect(() => {
    if (socket && userId) {
        socket.emit('registerUser', { userId, username });
    }
  }, [socket, userId, username]);


  const toggleTheme = () => {
    setTheme((currentTheme) => (currentTheme === 'light' ? 'dark' : 'light'));
    setIsUserPanelOpen(false);
  };

  const handleLoginSuccess = (newToken, newUserId, newUsername, newProfilePicUrl, newBio) => {
    setToken(newToken);
    setUsername(newUsername);
    setUserId(newUserId);
    setProfilePicUrl(newProfilePicUrl);
    setBio(newBio || '¡Hola! Estoy usando Nexo.');
    
    sessionStorage.setItem('chat-token', newToken);
    sessionStorage.setItem('chat-userId', newUserId);
    sessionStorage.setItem('chat-username', newUsername);
    sessionStorage.setItem('chat-profilePic', newProfilePicUrl);
    sessionStorage.setItem('chat-bio', newBio || '¡Hola! Estoy usando Nexo.');
  };
  
  const handleShowRegisterSuccess = (token, userId, username, profilePicUrl, bio) => {
    setPendingLoginData({ token, userId, username, profilePicUrl, bio });
    setShowRegisterModal(true);
  };
  
  const confirmRegistration = () => {
    if (pendingLoginData) {
      handleLoginSuccess(
        pendingLoginData.token,
        pendingLoginData.userId,
        pendingLoginData.username,
        pendingLoginData.profilePicUrl,
        pendingLoginData.bio
      );
    }
    setShowRegisterModal(false);
    setPendingLoginData(null);
  };
  
  const handleProfilePicUpdate = (newUrl) => {
    setProfilePicUrl(newUrl);
    sessionStorage.setItem('chat-profilePic', newUrl);
    handleShowInfo("¡Foto de perfil actualizada!");
  };
  
  const openProfileModal = () => {
    setTempBio(bio);
    setTempUsername(username);
    setIsEditingUsername(false);
    setShowProfileModal(true);
  }
  
  const closeProfileModal = () => {
    setShowProfileModal(false);
    setIsEditingUsername(false);
  }

  const handleSaveProfile = async () => {
    if (!tempUsername.trim()) {
      return handleShowInfo("El nombre de usuario no puede estar vacío.");
    }
    
    setIsProfileLoading(true);
    try {
      const response = await axios.put(
        `${API_URL}/profile/update`,
        { 
          newUsername: tempUsername,
          newBio: tempBio 
        },
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      
      const { newToken, username: updatedUsername, bio: updatedBio } = response.data;
      
      handleLoginSuccess(newToken, userId, updatedUsername, profilePicUrl, updatedBio);
      
      handleShowInfo("Perfil actualizado.");
      closeProfileModal();

    } catch (error) {
      console.error("Error al guardar el perfil:", error);
      handleShowInfo(error.response.data.message || "No se pudo guardar el perfil.");
    } finally {
      setIsProfileLoading(false);
    }
  };
  
  const silentLogout = () => {
    sessionStorage.removeItem('chat-token');
    sessionStorage.removeItem('chat-username');
    sessionStorage.removeItem('chat-userId');
    sessionStorage.removeItem('chat-profilePic');
    sessionStorage.removeItem('chat-bio');
    
    setToken(null);
    setUsername('');
    setUserId(null);
    setProfilePicUrl('');
    setBio('');
    // No desconectamos socket aquí, simplemente dejamos de emitir registerUser
    // El backend notará que el socket ID anterior ya no está vinculado si se refresca, 
    // o simplemente dejará de recibir mensajes privados.
    // Para ser más limpios, podemos forzar una desconexión y reconexión rápida:
    if (socket) {
        socket.disconnect();
        socket.connect(); // Reconecta limpio (sin userId) para ver el contador
    }
  }

  const handleLogout = () => {
    setIsUserPanelOpen(false);
    setShowLogoutConfirm(true); 
  };
  
  const confirmLogout = () => {
    silentLogout();
    setShowLogoutConfirm(false);
  };

  const closeDeleteModal = () => {
    setShowDeleteConfirm(false);
    setDeleteConfirmText('');
  }

  const handleDeleteAccount = () => {
    setIsUserPanelOpen(false);
    setShowDeleteConfirm(true);
  };

  const confirmDeleteAccount = async () => {
    if (deleteConfirmText !== username) {
      return;
    }
    try {
      await axios.delete(`${API_URL}/users/me`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      setInfoModalMessage("Tu cuenta ha sido eliminada.");
      setShowInfoModal(true);
      closeDeleteModal();
      silentLogout();
    } catch (error) {
      console.error("Error al eliminar la cuenta:", error);
      setInfoModalMessage("No se pudo eliminar la cuenta. Intenta de nuevo.");
      setShowInfoModal(true);
      closeDeleteModal();
    }
  };

  const handleShowRequestSent = (username) => {
    setRequestSentToUser(username);
    setShowRequestSentModal(true);
  };
  
  const handleShowInfo = (message) => {
    setInfoModalMessage(message);
    setShowInfoModal(true);
  };


  return (
    <div className={`App ${theme === 'dark' ? 'dark-mode' : ''}`}>
      
      {showLogoutConfirm && (
        <div className="modal-overlay priority-modal">
          <div className="modal-content">
            <h2>¿Cerrar Sesión?</h2>
            <p>¿Estás seguro de que quieres cerrar tu sesión?</p>
            <div className="modal-buttons">
              <button className="confirm-logout" onClick={confirmLogout}>
                Sí, cerrar sesión
              </button>
              <button className="cancel-delete" onClick={() => setShowLogoutConfirm(false)}>
                No, cancelar
              </button>
            </div>
          </div>
        </div>
      )}
      
      {showDeleteConfirm && (
        <div className="modal-overlay priority-modal">
          <div className="modal-content">
            <h2>¿Estás absolutamente seguro?</h2>
            <p>Esta acción no se puede deshacer. Se borrará tu perfil, chats y mensajes.</p>
            
            <label htmlFor="deleteConfirmInput">
              Para confirmar, escribe tu nombre de usuario: <strong>{username}</strong>
            </label>
            <input
              id="deleteConfirmInput"
              type="text"
              className="delete-confirm-input"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
            />
            
            <div className="modal-buttons">
              <button 
                className="confirm-delete" 
                onClick={confirmDeleteAccount}
                disabled={deleteConfirmText !== username}
              >
                Sí, eliminar mi cuenta
              </button>
              <button className="cancel-delete" onClick={closeDeleteModal}>
                No, cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {showRequestSentModal && (
        <div className="modal-overlay top-priority-modal">
          <div className="modal-content success">
            <h2>¡Solicitud Enviada!</h2>
            <p>Tu solicitud de chat ha sido enviada a <strong>{requestSentToUser}</strong>.</p>
            <div className="modal-buttons single-button">
              <button className="confirm-logout" onClick={() => setShowRequestSentModal(false)}>
                Aceptar
              </button>
            </div>
          </div>
        </div>
      )}

      {showInfoModal && (
        <div className="modal-overlay top-priority-modal">
          <div className="modal-content info">
            <h2>Aviso</h2>
            <p>{infoModalMessage}</p>
            <div className="modal-buttons single-button">
              <button className="confirm-logout" onClick={() => setShowInfoModal(false)}>
                Aceptar
              </button>
            </div>
          </div>
        </div>
      )}
      
      {showRegisterModal && (
        <div className="modal-overlay priority-modal">
          <div className="modal-content success">
            <h2>¡Cuenta Creada!</h2>
            <p>¡Bienvenido a Nexo, <strong>{pendingLoginData?.username}</strong>!</p>
            <p>Tu cuenta ha sido registrada exitosamente.</p>
            <div className="modal-buttons single-button">
              <button className="confirm-logout" onClick={confirmRegistration}>
                Empezar a chatear
              </button>
            </div>
          </div>
        </div>
      )}
      
      {showProfileModal && (
        <div className="modal-overlay priority-modal">
          <div className="modal-content profile-modal">
            <h2>Tu Perfil</h2>
            
            <ProfileUploader 
              token={token}
              onUploadSuccess={handleProfilePicUpdate}
              onShowInfo={handleShowInfo}
              uploaderId="profile-pic-upload"
            >
              <div className="profile-avatar-wrapper">
                <img 
                  src={profilePicUrl}
                  alt="Perfil" 
                  className="profile-modal-avatar"
                />
                <span className="edit-avatar-icon">✎</span>
              </div>
            </ProfileUploader>
            
            <div className="username-edit-wrapper">
              {isEditingUsername ? (
                <>
                  <input
                    type="text"
                    value={tempUsername}
                    onChange={(e) => setTempUsername(e.target.value)}
                    className="username-input"
                  />
                  <button className="username-edit-btn" onClick={() => setIsEditingUsername(false)}>(Cancelar)</button>
                </>
              ) : (
                <>
                  <h3>{username}</h3>
                  <button className="username-edit-btn" onClick={() => setIsEditingUsername(true)}>(Editar)</button>
                </>
              )}
            </div>
            
            <label htmlFor="bio-textarea">Tu presentación:</label>
            <textarea
              id="bio-textarea"
              className="bio-textarea"
              value={tempBio}
              onChange={(e) => setTempBio(e.target.value)}
              maxLength={150}
            />
            <div className="char-counter">{tempBio ? tempBio.length : 0} / 150</div>
            
            <div className="modal-buttons">
              <button 
                className="confirm-logout" 
                onClick={handleSaveProfile}
                disabled={isProfileLoading}
              >
                {isProfileLoading ? 'Guardando...' : 'Guardar Cambios'}
              </button>
              <button className="cancel-delete" onClick={closeProfileModal}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}


      <h1>Nexo</h1>
      
      {!token && (
        <>
          <p className="app-slogan">Conectando tu mundo.</p>
          <Auth 
            onLoginSuccess={handleLoginSuccess}
            onRegisterSuccess={handleShowRegisterSuccess}
            theme={theme}
            toggleTheme={toggleTheme}
            userCount={userCount}
            onShowInfo={handleShowInfo}
          />
        </>
      )}
      
      {token && (
        <div>
          <div className="user-controls">
            
            <img 
              src={profilePicUrl}
              alt="Perfil" 
              className="user-avatar-small"
              title="Ver tu perfil"
              onClick={openProfileModal}
            />

            <span>¡Bienvenido, {username}!</span>
            
            <button 
              className="options-button"
              onClick={() => setIsUserPanelOpen(!isUserPanelOpen)}
            >
              Opciones ⚙️
            </button>

            {isUserPanelOpen && (
              <div className="user-panel">
                <button onClick={toggleTheme}>
                  Activar Modo {theme === 'light' ? 'Oscuro' : 'Claro'}
                </button>
                <button onClick={handleLogout}>Cerrar Sesión</button>
                <button className="delete" onClick={handleDeleteAccount}>
                  Eliminar Cuenta
                </button>
              </div>
            )}
            
          </div>
          
          <Chat 
            token={token} 
            userId={userId} 
            username={username}
            socket={socket}
            onShowRequestSent={handleShowRequestSent}
            onShowInfo={handleShowInfo}
            onlineUsersMap={onlineUsersMap}
          />
        </div>
      )}
      
    </div>
  );
}

export default App;