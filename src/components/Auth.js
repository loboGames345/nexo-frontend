// src/components/Auth.js

import React, { useState } from 'react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

function Auth({ onLoginSuccess, onRegisterSuccess, theme, toggleTheme, userCount, onShowInfo }) {
  
  const [activeTab, setActiveTab] = useState('login');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

const handleRegister = async () => {
    // Validar contraseña antes de enviar (Para no esperar al servidor)
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
    
    if (!passwordRegex.test(password)) {
       onShowInfo("La contraseña debe tener: Mínimo 8 caracteres, 1 Mayúscula, 1 Minúscula, 1 Número y 1 Símbolo.");
       return;
    }

    try {
      const response = await axios.post(`${API_URL}/register`, {
        username: username,
        password: password
      });
      
      const { token, userId, username: registeredUsername, profilePictureUrl, bio } = response.data;
      
      onRegisterSuccess(token, userId, registeredUsername, profilePictureUrl, bio);

    } catch (error) {
      onShowInfo(error.response?.data?.message || "Error en el registro.");
      console.error("Error en el registro:", error.response?.data);
    }
  };

  const handleLogin = async () => {
    try {
      const response = await axios.post(`${API_URL}/login`, {
        username: username,
        password: password
      });

      const { token, userId, username: loggedInUsername, profilePictureUrl, bio } = response.data;
      
      // --- CAMBIO: Usar sessionStorage ---
      // Así, si cierras el navegador, se pierde la sesión
      sessionStorage.setItem('chat-token', token);
      sessionStorage.setItem('chat-userId', userId);
      sessionStorage.setItem('chat-username', loggedInUsername);
      sessionStorage.setItem('chat-profilePic', profilePictureUrl);
      sessionStorage.setItem('chat-bio', bio);
      
      onLoginSuccess(token, userId, loggedInUsername, profilePictureUrl, bio);

    } catch (error) {
      onShowInfo(error.response?.data?.message || "Error al iniciar sesión.");
      console.error("Error en el login:", error.response?.data);
    }
  };
  
  const handleSubmit = (e) => {
    e.preventDefault();
    if (activeTab === 'login') {
      handleLogin();
    } else {
      handleRegister();
    }
  };

  return (
    <>
      <div className="auth-container">
        
        <div className="auth-tabs">
          <button 
            type="button"
            className={`auth-tab ${activeTab === 'login' ? 'active' : ''}`}
            onClick={() => setActiveTab('login')}
          >
            Iniciar Sesión
          </button>
          <button 
            type="button"
            className={`auth-tab ${activeTab === 'register' ? 'active' : ''}`}
            onClick={() => setActiveTab('register')}
          >
            Registrarse
          </button>
        </div>
        
        <form onSubmit={handleSubmit}>
          <h2>{activeTab === 'login' ? 'Iniciar Sesión' : 'Crear Cuenta'}</h2>
          
          <div>
            <input 
              type="text" 
              placeholder="Usuario" 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>

          <div className="password-wrapper">
            <input 
              type={isPasswordVisible ? 'text' : 'password'}
              placeholder="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button 
              type="button"
              className="password-toggle-icon" 
              onClick={() => setIsPasswordVisible(!isPasswordVisible)}
            >
              {isPasswordVisible ? 'Ocultar' : 'Mostrar'}
            </button>
          </div>

          {/* --- NUEVO: REQUISITOS DE CONTRASEÑA (SOLO EN REGISTRO) --- */}
          {activeTab === 'register' && (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '15px', textAlign: 'left', padding: '0 5px' }}>
                <p style={{margin: '0 0 5px 0', fontWeight: 'bold'}}>La contraseña debe incluir:</p>
                <ul style={{margin: 0, paddingLeft: '20px', listStyleType: 'disc'}}>
                    <li style={{color: /(?=.*[A-Z])/.test(password) ? 'var(--accent-safe)' : 'inherit'}}>1 Mayúscula</li>
                    <li style={{color: /(?=.*[a-z])/.test(password) ? 'var(--accent-safe)' : 'inherit'}}>1 Minúscula</li>
                    <li style={{color: /(?=.*\d)/.test(password) ? 'var(--accent-safe)' : 'inherit'}}>1 Número</li>
                    <li style={{color: /(?=.*[\W_])/.test(password) ? 'var(--accent-safe)' : 'inherit'}}>1 Caracter especial (ej. !@#$)</li>
                    <li style={{color: password.length >= 8 ? 'var(--accent-safe)' : 'inherit'}}>Mínimo 8 caracteres</li>
                </ul>
            </div>
          )}

          <div className="auth-buttons">
            {activeTab === 'login' ? (
              <button type="submit">Iniciar Sesión</button>
            ) : (
              <button type="submit">Registrar Cuenta</button>
            )}
          </div>
        </form>

        <div className="theme-toggle-auth">
          <button type="button" onClick={toggleTheme}>
            Activar Modo {theme === 'light' ? 'Oscuro' : 'Claro'}
          </button>
        </div>
      </div>
      
      <div className="online-users-counter">
        <span className="online-dot"></span>
        {userCount} {userCount === 1 ? 'usuario' : 'usuarios'} en línea
      </div>
    </>
  );
}

export default Auth;