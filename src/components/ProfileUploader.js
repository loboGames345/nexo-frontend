// src/components/ProfileUploader.js

import React, { useState, useRef } from 'react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

function ProfileUploader({ 
  token, 
  onUploadSuccess, 
  onShowInfo, 
  children,
  uploadUrl = `${API_URL}/profile/upload`,
  paramName = 'profilePic',
  // --- ¡LA CLAVE ES ESTA PROP! ---
  uploaderId // <-- Esta es la ID única (ej. "profile-pic-upload")
}) {
  
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileChange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
      return onShowInfo("Solo se permiten archivos de imagen (JPG, PNG, etc).");
    }

    setIsLoading(true);
    const formData = new FormData();
    formData.append(paramName, file); // Usa el nombre de param genérico

    try {
      const response = await axios.post(
        uploadUrl, // Usa la URL genérica
        formData, 
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'multipart/form-data'
          }
        }
      );
      
      const newUrl = response.data.profilePictureUrl || response.data.groupPictureUrl;
      
      onUploadSuccess(newUrl); // Devuelve la URL

    } catch (error) {
      console.error("Error al subir la imagen:", error);
      onShowInfo(error.response.data.message || "Error al subir la imagen.");
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    // ¡Es un <label> que "apunta" al input oculto!
    <label htmlFor={uploaderId} className="profile-uploader-label">
      
      {/* Input de archivo real, pero oculto */}
      <input 
        id={uploaderId} // <-- ¡Usa la ID única!
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        disabled={isLoading}
        ref={fileInputRef}
        style={{ display: 'none' }} // Sigue oculto
      />
      
      {isLoading ? (
        <div className="avatar-loading">...</div>
      ) : (
        // Muestra la imagen de perfil (el <img ... /> de App.js)
        children 
      )}
    </label>
  );
}

export default ProfileUploader;