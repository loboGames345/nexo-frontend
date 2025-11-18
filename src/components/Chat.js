// src/components/Chat.js

import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import ProfileUploader from './ProfileUploader'; 

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
const DEFAULT_PROFILE_PIC = 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png';
const DEFAULT_GROUP_PIC = 'https://cdn.pixabay.com/photo/2016/11/14/17/39/group-1824145_1280.png';

function Chat({ token, userId, username, socket, onShowRequestSent, onShowInfo, onlineUsersMap }) {

  const [chatRequests, setChatRequests] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [groupChats, setGroupChats] = useState([]);

  const [selectedChat, setSelectedChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [pendingUser, setPendingUser] = useState(null);
  
  const [deletingConv, setDeletingConv] = useState(null);
  const [blockingUser, setBlockingUser] = useState(null);
  const [kickingUser, setKickingUser] = useState(null); 

  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupMembers, setNewGroupMembers] = useState([]);
  
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [inviteMembers, setInviteMembers] = useState([]);
  const [isInviteSectionOpen, setIsInviteSectionOpen] = useState(false);
  
  const [showGroupSettingsModal, setShowGroupSettingsModal] = useState(false);
  const [tempGroupName, setTempGroupName] = useState('');
  const [isGroupLoading, setIsGroupLoading] = useState(false);

  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);


  // Cargar las conversaciones (Hook 1)
  useEffect(() => {
    const fetchConversations = async () => {
      try {
        const response = await axios.get(`${API_URL}/conversations`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const allConversations = response.data;
        
        const pending = allConversations.filter(c => {
            if (c.isGroup) return false;
            if (c.status !== 'pending') return false;
            if (!c.initiatedBy || !c.initiatedBy._id) return false;

            const initiatorId = String(c.initiatedBy._id);
            const myId = String(userId);

            if (initiatorId === myId) {
                return false; 
            }
            return true;
        });

        const activeDMs = allConversations.filter(c => !c.isGroup && c.status === 'active');
        const activeGroups = allConversations.filter(c => c.isGroup && c.status === 'active');
        
        setChatRequests(pending);
        setConversations(activeDMs);
        setGroupChats(activeGroups);
      } catch (error) {
        console.error("Error al cargar conversaciones:", error);
      }
    };
    if (token && userId) {
      fetchConversations();
    }
  }, [token, userId]);

  // Hook 2.1: Para registrar al usuario (Solo si es necesario)
  useEffect(() => {
    if (!socket || !userId) return;
    // Emitir solo si el socket está conectado
    if (socket.connected) {
        socket.emit('registerUser', { userId, username });
    }
  }, [socket, userId, username]);

  // Hook 2.2: Para solicitudes y grupos
  useEffect(() => {
    if (!socket) return;

    const handleNewRequest = (newRequest) => {
      setChatRequests((prevRequests) => {
         if (prevRequests.some(r => r._id === newRequest._id)) return prevRequests;
         if (newRequest.initiatedBy && String(newRequest.initiatedBy._id) === String(userId)) {
             return prevRequests;
         }
         return [...prevRequests, newRequest];
      });
    };
    const handleRequestAccepted = (acceptedChat) => {
      setConversations((prevConversations) => {
         if (prevConversations.some(c => c._id === acceptedChat._id)) return prevConversations;
         return [...prevConversations, acceptedChat];
      });
    };
    const handleNewGroup = (newGroup) => {
      setGroupChats((prevGroups) => {
        if (prevGroups.some(g => g._id === newGroup._id)) {
          return prevGroups;
        }
        onShowInfo(`¡Has sido añadido a un nuevo grupo: ${newGroup.groupName}!`);
        return [...prevGroups, newGroup];
      });
    };
    const handleConversationUpdated = (updatedConv) => {
      if (updatedConv.isGroup) {
        const amIParticipant = updatedConv.participants.some(p => p._id === userId);
        if (!amIParticipant) {
             setGroupChats(prev => prev.filter(g => g._id !== updatedConv._id));
             if (selectedChat?._id === updatedConv._id) {
                 setSelectedChat(null);
                 setMessages([]);
                 onShowInfo("Has sido expulsado del grupo.");
             }
        } else {
             setGroupChats(prev => prev.map(g => g._id === updatedConv._id ? updatedConv : g));
             if (selectedChat?._id === updatedConv._id) {
                 setSelectedChat(updatedConv);
             }
        }
      } else {
        setConversations(prev => prev.map(c => c._id === updatedConv._id ? updatedConv : c));
      }
    };

    socket.on('newChatRequest', handleNewRequest);
    socket.on('chatRequestAccepted', handleRequestAccepted);
    socket.on('newGroupChat', handleNewGroup);
    socket.on('conversationUpdated', handleConversationUpdated);

    return () => {
      socket.off('newChatRequest', handleNewRequest);
      socket.off('chatRequestAccepted', handleRequestAccepted);
      socket.off('newGroupChat', handleNewGroup);
      socket.off('conversationUpdated', handleConversationUpdated);
    };
  }, [socket, onShowInfo, selectedChat, userId]);
  
  // Hook 2.3: Para mensajes
  useEffect(() => {
    if (!socket) return;
    const handleNewMessage = (incomingMessage) => {
      if (incomingMessage.conversationId === selectedChat?._id) {
        setMessages((prevMessages) => {
            // Evitar duplicados de mensajes por si acaso
            if (prevMessages.some(m => m._id === incomingMessage._id)) return prevMessages;
            return [...prevMessages, incomingMessage];
        });
      }
    };
    socket.on('newMessage', handleNewMessage);
    return () => {
      socket.off('newMessage', handleNewMessage);
    };
  }, [socket, selectedChat]);
  
  // Hook 2.4: Para notificar al backend qué chat estamos viendo
  useEffect(() => {
    if (socket && selectedChat) {
      socket.emit('joinChatRoom', selectedChat._id);
    }
    return () => {
      if (socket) {
        socket.emit('leaveChatRoom');
      }
    };
  }, [socket, selectedChat]);


  // Cargar mensajes al seleccionar chat
  const handleSelectChat = async (conversation) => {
    if (conversation.status !== 'active') {
       setSelectedChat(conversation);
       setMessages([]);
       return; 
    }
    setSelectedChat(conversation);
    setInviteMembers([]);
    setTempGroupName(conversation.groupName || '');
    
    try {
      const readResponse = await axios.post(
        `${API_URL}/conversations/${conversation._id}/read`,
        {},
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      
      const updatedConv = readResponse.data;
      if (updatedConv.isGroup) {
        setGroupChats(prev => prev.map(g => g._id === updatedConv._id ? updatedConv : g));
      } else {
        setConversations(prev => prev.map(c => c._id === updatedConv._id ? updatedConv : c));
      }
      
    } catch (error) {
      console.error("Error al marcar como leído:", error);
    }

    try {
      const response = await axios.get(
        `${API_URL}/conversations/${conversation._id}/messages`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      setMessages(response.data);
    } catch (error) {
      console.error("Error al cargar mensajes:", error);
      setMessages([]);
    }
  };

  // Enviar mensaje
  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedChat || selectedChat.status !== 'active') return;
    try {
      await axios.post(
        `${API_URL}/conversations/${selectedChat._id}/messages`,
        { content: newMessage },
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      setNewMessage('');
    } catch (error) {
      console.error("Error al enviar mensaje:", error);
      if (error.response && error.response.status === 403) {
        onShowInfo(error.response.data.message);
      }
    }
  };

  // Función de Búsqueda
  const handleSearch = async (e) => {
    const query = e.target.value;
    setSearchQuery(query);
    setPendingUser(null);
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    try {
      const response = await axios.get(
        `${API_URL}/users/search?query=${query}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      setSearchResults(response.data);
    } catch (error) {
      console.error("Error al buscar usuarios:", error);
    }
  };

  // Función para Iniciar Chat
  const handleStartChat = async (otherUser) => {
    try {
      const response = await axios.post(
        `${API_URL}/conversations`,
        { otherUsername: otherUser.username },
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      const newConversation = response.data;
      setSearchQuery('');
      setSearchResults([]);
      setPendingUser(null);
      if (response.status === 201) {
         onShowRequestSent(otherUser.username);
      } else if (response.status === 200) {
        const existingConversation = response.data;
        if (existingConversation.status === 'active') {
          onShowInfo(`Ya tienes un chat activo con ${otherUser.username}.`);
          handleSelectChat(existingConversation);
        } else if (existingConversation.status === 'pending') {
          if (existingConversation.initiatedBy._id === userId) {
            onShowInfo(`Ya has enviado una solicitud a ${otherUser.username}.`);
          } else {
            onShowInfo(`${otherUser.username} ya te envió una solicitud. ¡Revisa tu lista de solicitudes!`);
          }
        }
      }
    } catch (error) {
      console.error("Error al iniciar conversación:", error);
      if (error.response && (error.response.status === 403 || error.response.status === 400)) {
        onShowInfo(error.response.data.message);
      } else {
        onShowInfo("Error al enviar solicitud.");
      }
      setPendingUser(null);
    }
  };
  
  // Función para Aceptar Chat
  const handleAcceptChat = async (conversation) => {
    try {
      const response = await axios.post(
        `${API_URL}/conversations/${conversation._id}/accept`,
        {},
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      const activatedConversation = response.data;
      setChatRequests(prev => prev.filter(req => req._id !== conversation._id));
      setConversations(prev => [...prev, activatedConversation]);
      handleSelectChat(activatedConversation);
    } catch (error) {
      console.error("Error al aceptar el chat:", error);
      if (error.response && error.response.status === 403) {
        onShowInfo(error.response.data.message);
      }
    }
  };
  
  // Función para Confirmar Borrado
  const confirmDeleteOrLeave = async () => {
    if (!deletingConv) return;
    try {
      await axios.delete(
        `${API_URL}/conversations/${deletingConv._id}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (deletingConv.isGroup) {
        setGroupChats(prev => prev.filter(g => g._id !== deletingConv._id));
      } else {
        setConversations(prev => prev.filter(c => c._id !== deletingConv._id));
      }
      if (selectedChat?._id === deletingConv._id) {
        setSelectedChat(null);
        setMessages([]);
      }
      setDeletingConv(null);
      setShowGroupSettingsModal(false);
    } catch (error) {
      console.error("Error al borrar/salir de la conversación:", error);
      onShowInfo("No se pudo procesar la solicitud.");
      setDeletingConv(null);
    }
  };
  
  // Función para Confirmar Bloqueo
  const handleConfirmBlock = async () => {
    if (!blockingUser) return;
    try {
      const response = await axios.post(
        `${API_URL}/users/${blockingUser._id}/block`,
        {},
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      onShowInfo(response.data.message);
      setBlockingUser(null);
      setSelectedChat(null);
      setMessages([]);
    } catch (error) {
      console.error("Error al bloquear usuario:", error);
      onShowInfo(error.response.data.message || "No se pudo bloquear al usuario.");
      setBlockingUser(null);
    }
  };

  // Funciones para el Modal de Grupo
  const handleMemberToggle = (friendId) => {
    setNewGroupMembers((prevMembers) => {
      if (prevMembers.includes(friendId)) {
        return prevMembers.filter(id => id !== friendId);
      } else {
        return [...prevMembers, friendId];
      }
    });
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) {
      return onShowInfo("El nombre del grupo no puede estar vacío.");
    }
    if (newGroupMembers.length === 0) {
      return onShowInfo("Debes seleccionar al menos un miembro.");
    }
    try {
      const response = await axios.post(
        `${API_URL}/groups`,
        { 
          groupName: newGroupName,
          participants: newGroupMembers
        },
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      const newGroup = response.data;
      setGroupChats((prev) => [...prev, newGroup]);
      setShowCreateGroupModal(false);
      setNewGroupName('');
      setNewGroupMembers([]);
      handleSelectChat(newGroup);
    } catch (error) {
      console.error("Error al crear grupo:", error);
      onShowInfo(error.response.data.message || "No se pudo crear el grupo.");
    }
  };
  
  const handleInviteMembers = async () => {
    if (inviteMembers.length === 0) {
      return onShowInfo("No has seleccionado a nadie para invitar.");
    }
    try {
      const response = await axios.post(
        `${API_URL}/groups/${selectedChat._id}/add-members`,
        { newMembers: inviteMembers },
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      setSelectedChat(response.data); 
      setInviteMembers([]);
      onShowInfo("¡Miembros añadidos con éxito!");
    } catch (error) {
       console.error("Error al añadir miembros:", error);
       onShowInfo(error.response.data.message || "No se pudo añadir miembros.");
    }
  };
  
  const handleInviteToggle = (friendId) => {
    setInviteMembers((prev) => {
      if (prev.includes(friendId)) {
        return prev.filter(id => id !== friendId);
      } else {
        return [...prev, friendId];
      }
    });
  };
  
  const closeMembersModal = () => {
    setShowMembersModal(false);
    setIsInviteSectionOpen(false);
    setInviteMembers([]);
  };

  // --- GESTIÓN DE ROLES Y EXPULSIÓN ---
  
  const handlePromoteToAdmin = async (memberId, memberName) => {
    try {
      const response = await axios.put(
        `${API_URL}/groups/${selectedChat._id}/promote`,
        { memberId },
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      setSelectedChat(response.data);
      onShowInfo(`¡${memberName} ahora es administrador!`);
    } catch (error) {
      console.error("Error al promover admin:", error);
      onShowInfo(error.response.data.message || "Error al promover.");
    }
  }

  const handleDemoteAdmin = async (memberId, memberName) => {
    try {
      const response = await axios.put(
        `${API_URL}/groups/${selectedChat._id}/demote`,
        { memberId },
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      setSelectedChat(response.data);
      onShowInfo(`¡${memberName} ya no es administrador!`);
    } catch (error) {
      console.error("Error al degradar admin:", error);
      onShowInfo(error.response.data.message || "Error al quitar admin.");
    }
  }

  const handleKickMember = (memberId, memberName) => {
    setKickingUser({ memberId, memberName });
  };

  const confirmKickMember = async () => {
    if (!kickingUser) return;
    
    try {
        const response = await axios.put(
            `${API_URL}/groups/${selectedChat._id}/kick`,
            { memberId: kickingUser.memberId },
            { headers: { 'Authorization': `Bearer ${token}` } }
        );
        setSelectedChat(response.data);
        onShowInfo(`¡${kickingUser.memberName} ha sido expulsado del grupo!`);
    } catch (error) {
        console.error("Error al expulsar:", error);
        onShowInfo(error.response.data.message || "Error al expulsar.");
    } finally {
        setKickingUser(null); // Cerrar modal
    }
  }

  // --- FUNCIÓN PARA CAMBIAR FOTO DE GRUPO ---
  const handleGroupPicUpdate = (newUrl) => {
     setSelectedChat(prev => ({ ...prev, groupPictureUrl: newUrl }));
     setGroupChats(prev => prev.map(g => 
        g._id === selectedChat._id ? { ...g, groupPictureUrl: newUrl } : g
     ));
     onShowInfo("¡Foto de grupo actualizada!");
  };
  
  // Funciones para Ajustes de Grupo
  const handleSaveGroupDetails = async () => {
    if (!tempGroupName.trim()) {
      return onShowInfo("El nombre del grupo no puede estar vacío.");
    }
    setIsGroupLoading(true);
    try {
      const response = await axios.put(
        `${API_URL}/groups/${selectedChat._id}/details`,
        { groupName: tempGroupName },
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      const updatedGroup = response.data;
      setGroupChats(prev => prev.map(g => g._id === updatedGroup._id ? updatedGroup : g));
      setSelectedChat(updatedGroup);
      setShowGroupSettingsModal(false);
      onShowInfo("Ajustes del grupo guardados.");
      
    } catch (error) {
      console.error("Error al guardar ajustes:", error);
      onShowInfo(error.response.data.message || "No se pudo guardar.");
    } finally {
      setIsGroupLoading(false);
    }
  };

  // Helpers
  const getOtherParticipant = (participants) => {
    if (!participants) return null; 
    return participants.find(p => p.username !== username) || null;
  };

  // --- FUNCIONES DE VERIFICACIÓN SEGURAS ---
  
  const isMemberFounder = (chat, memberId) => {
     if (!chat || !chat.groupFounder) return false;
     const founderId = (chat.groupFounder && chat.groupFounder._id) ? chat.groupFounder._id : chat.groupFounder;
     return founderId && founderId.toString() === memberId;
  }

  const checkIsAdmin = (chat) => {
    if (!chat || !chat.groupAdmin) return false;
    if (Array.isArray(chat.groupAdmin)) {
      return chat.groupAdmin.some(admin => {
         const adminId = (admin && admin._id) ? admin._id : admin;
         return adminId && adminId.toString() === userId;
      });
    }
    const adminId = (chat.groupAdmin && chat.groupAdmin._id) ? chat.groupAdmin._id : chat.groupAdmin;
    return adminId && adminId.toString() === userId;
  };
  
  const isMemberAdmin = (chat, memberId) => {
    if (!chat || !chat.groupAdmin) return false;
    if (Array.isArray(chat.groupAdmin)) {
      return chat.groupAdmin.some(admin => {
        const adminId = (admin && admin._id) ? admin._id : admin;
        return adminId && adminId.toString() === memberId;
      });
    }
    const adminId = (chat.groupAdmin && chat.groupAdmin._id) ? chat.groupAdmin._id : chat.groupAdmin;
    return adminId && adminId.toString() === memberId;
  };

  const isCurrentUserAdmin = checkIsAdmin(selectedChat);
  const isCurrentUserFounder = isMemberFounder(selectedChat, userId);
  
  const canEditGroup = isCurrentUserFounder || isCurrentUserAdmin;

  const friendsList = conversations
    .filter(c => !c.isGroup && c.status === 'active')
    .map(c => getOtherParticipant(c.participants))
    .filter(Boolean);
    
  const friendsToInvite = selectedChat && friendsList
    ? friendsList.filter(friend => 
        !selectedChat.participants.some(p => p._id === friend._id)
      ) 
    : [];

  return (
    <div className="chat-container">
      
      {deletingConv && (
        <div className="modal-overlay priority-modal">
          <div className="modal-content delete-conv">
            <h2>{deletingConv.isGroup ? 'Salir del Grupo' : 'Eliminar Chat'}</h2>
            <p>
              ¿Seguro que quieres {deletingConv.isGroup ? 'salir de' : 'eliminar tu chat con'} <strong>
                {deletingConv.isGroup 
                  ? deletingConv.groupName 
                  : getOtherParticipant(deletingConv.participants)?.username}
              </strong>?
            </p>
            {deletingConv.isGroup ? (
              <p><strong>Esta acción es permanente.</strong> Para volver a unirte, necesitarás que otro miembro te invite.</p>
            ) : (
              <p>Esto solo lo ocultará de tu vista. Si te envían un nuevo mensaje, el chat reaparecerá.</p>
            )}
            <div className="modal-buttons">
              <button className="confirm-delete" onClick={confirmDeleteOrLeave}>{deletingConv.isGroup ? 'Sí, salir' : 'Sí, eliminar'}</button>
              <button className="cancel-delete" onClick={() => setDeletingConv(null)}>No, cancelar</button>
            </div>
          </div>
        </div>
      )}
      
      {blockingUser && (
        <div className="modal-overlay priority-modal">
          <div className="modal-content delete-conv">
            <h2>Bloquear Usuario</h2>
            <p>¿Seguro que quieres bloquear a <strong>{blockingUser.username}</strong> por 1 hora?</p>
            <p>No podrás iniciar chats, enviar mensajes o recibir mensajes de este usuario.</p>
            <div className="modal-buttons">
              <button className="confirm-delete" onClick={handleConfirmBlock}>Sí, bloquear</button>
              <button className="cancel-delete" onClick={() => setBlockingUser(null)}>No, cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMACIÓN KICK */}
      {kickingUser && (
        <div className="modal-overlay top-priority-modal">
          <div className="modal-content delete-conv">
            <h2>Expulsar Miembro</h2>
            <p>¿Estás seguro de que quieres expulsar a <strong>{kickingUser.memberName}</strong> del grupo?</p>
            <div className="modal-buttons">
              <button className="confirm-delete" onClick={confirmKickMember}>Sí, expulsar</button>
              <button className="cancel-delete" onClick={() => setKickingUser(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {showCreateGroupModal && (
        <div className="modal-overlay priority-modal">
          <div className="modal-content create-group">
            <h2>Crear un nuevo grupo</h2>
            <input 
              type="text"
              placeholder="Nombre del grupo..."
              className="group-name-input"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
            />
            <h3>Invitar amigos:</h3>
            <ul className="friend-list">
              {friendsList.length > 0 ? friendsList.map(friend => (
                <li key={friend._id}>
                  <label>
                    <input 
                      type="checkbox"
                      checked={newGroupMembers.includes(friend._id)}
                      onChange={() => handleMemberToggle(friend._id)}
                    />
                    {friend.username}
                  </label>
                </li>
              )) : (
                <p>No tienes amigos (chats 1-a-1) para invitar.</p>
              )}
            </ul>
            <div className="modal-buttons">
              <button className="confirm-logout" onClick={handleCreateGroup}>Crear Grupo</button>
              <button className="cancel-delete" onClick={() => setShowCreateGroupModal(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {showMembersModal && selectedChat && (
        <div className="modal-overlay priority-modal">
          <div className="modal-content info">
            <h2>Miembros de {selectedChat.groupName}</h2>
            <ul className="members-list">
              {selectedChat.participants.map(member => {
                const isOnline = onlineUsersMap.hasOwnProperty(member._id);
                const avatarUrl = member.profilePictureUrl || DEFAULT_PROFILE_PIC;
                const isThisMemberAdmin = isMemberAdmin(selectedChat, member._id);
                const isThisMemberFounder = isMemberFounder(selectedChat, member._id);
                const isMe = member._id === userId;

                return (
                  <li key={member._id}>
                    <div style={{display: 'flex', alignItems: 'center', flex: 1}}>
                        <img 
                        src={avatarUrl} 
                        alt={member.username} 
                        className={`avatar-in-list ${isOnline ? 'online' : 'offline'}`} 
                        />
                        <span className="conv-name">{member.username}</span>
                        
                        {isThisMemberFounder ? (
                             <span className="admin-tag" style={{color: 'gold'}}> (Fundador)</span>
                        ) : isThisMemberAdmin ? (
                             <span className="admin-tag"> (Admin)</span>
                        ) : null}
                    </div>
                    
                    {/* BOTONES DE GESTIÓN */}
                    {!isMe && (
                      <>
                        {/* CASO 1: PROMOVER O EXPULSAR A MIEMBRO NORMAL */}
                        {isCurrentUserAdmin && !isThisMemberAdmin && !isThisMemberFounder && (
                            <>
                                <button 
                                    className="make-admin-btn"
                                    onClick={() => handlePromoteToAdmin(member._id, member.username)}
                                    title="Hacer administrador"
                                >
                                    ⬆️
                                </button>
                                <button 
                                    className="kick-btn"
                                    onClick={() => handleKickMember(member._id, member.username)}
                                    title="Expulsar miembro"
                                >
                                    🚫
                                </button>
                            </>
                        )}

                        {/* CASO 2: DEGRADAR O EXPULSAR A ADMIN (SOLO FUNDADOR) */}
                        {isCurrentUserFounder && isThisMemberAdmin && !isThisMemberFounder && (
                            <>
                                <button 
                                    className="demote-admin-btn"
                                    onClick={() => handleDemoteAdmin(member._id, member.username)}
                                    title="Quitar administrador"
                                >
                                    ⬇️
                                </button>
                                <button 
                                    className="kick-btn"
                                    onClick={() => handleKickMember(member._id, member.username)}
                                    title="Expulsar admin"
                                >
                                    🚫
                                </button>
                            </>
                        )}
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
            
            {isCurrentUserAdmin && (
              <div className="add-members-section">
                <h3 onClick={() => setIsInviteSectionOpen(!isInviteSectionOpen)}>
                  Añadir Miembros
                  <span className="toggle-arrow">{isInviteSectionOpen ? '▲' : '▼'}</span>
                </h3>
                {isInviteSectionOpen && (
                  <>
                    <ul className="friend-list invite">
                      {friendsToInvite && friendsToInvite.length > 0 ? friendsToInvite.map(friend => (
                        <li key={friend._id}>
                          <label>
                            <input 
                              type="checkbox"
                              checked={inviteMembers.includes(friend._id)}
                              onChange={() => handleInviteToggle(friend._id)}
                            />
                            {friend.username}
                          </label>
                        </li>
                      )) : (
                        <p>No tienes más amigos para invitar.</p>
                      )}
                    </ul>
                    <button 
                      className="invite-btn" 
                      onClick={handleInviteMembers}
                      disabled={!inviteMembers || inviteMembers.length === 0}
                    >
                      Añadir ({inviteMembers ? inviteMembers.length : 0})
                    </button>
                  </>
                )}
              </div>
            )}
            
            <div className="modal-buttons single-button">
              <button className="confirm-logout" onClick={closeMembersModal}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
      
      {showGroupSettingsModal && selectedChat && (
        <div className="modal-overlay priority-modal">
          <div className="modal-content profile-modal group-settings-modal"> 
            <h2>Ajustes del Grupo</h2>
            
            {canEditGroup ? (
              <>
                <ProfileUploader 
                    token={token}
                    onUploadSuccess={handleGroupPicUpdate}
                    onShowInfo={onShowInfo}
                    uploaderId="group-pic-upload"
                    uploadUrl={`${API_URL}/groups/${selectedChat._id}/avatar`}
                    paramName="groupPic"
                >
                    <div className="profile-avatar-wrapper">
                        <img 
                            src={selectedChat.groupPictureUrl || DEFAULT_GROUP_PIC}
                            alt="Grupo" 
                            className="profile-modal-avatar"
                        />
                        <span className="edit-avatar-icon">✎</span>
                    </div>
                </ProfileUploader>
                
                <input
                    type="text"
                    value={tempGroupName}
                    onChange={(e) => setTempGroupName(e.target.value)}
                    className="username-input"
                  />
              </>
            ) : (
              <>
                <img 
                  src={selectedChat.groupPictureUrl || DEFAULT_GROUP_PIC}
                  alt="Grupo" 
                  className="profile-modal-avatar"
                  style={{cursor: 'default'}}
                />
                <h3>{selectedChat.groupName}</h3>
              </>
            )}
            
            <div className="group-settings-buttons">
              <button className="view-members-btn" onClick={() => {
                setShowGroupSettingsModal(false);
                setShowMembersModal(true);
              }}>
                Ver Miembros
              </button>
              <button className="delete-btn" onClick={() => {
                setDeletingConv(selectedChat);
                setShowGroupSettingsModal(false);
              }}>
                Salir del Grupo
              </button>
            </div>
            
            <div className="modal-buttons">
              {canEditGroup && (
                <button 
                  className="confirm-logout" 
                  onClick={handleSaveGroupDetails}
                  disabled={isGroupLoading}
                >
                  {isGroupLoading ? 'Guardando...' : 'Guardar'}
                </button>
              )}
              <button className="cancel-delete" onClick={() => setShowGroupSettingsModal(false)}>
                {canEditGroup ? 'Cancelar' : 'Cerrar'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      
      <div className="chat-layout">
        <div className="conversations-list">
          
          <div className="create-group-wrapper">
            <button className="create-group-btn" onClick={() => setShowCreateGroupModal(true)}>
              Crear Grupo +
            </button>
          </div>
          
          <div className="search-area">
            <input 
              type="text"
              placeholder="Buscar usuario..."
              value={searchQuery}
              onChange={handleSearch}
            />
            <ul className="search-results">
              {searchResults.map(user => (
                <li key={user._id} onClick={() => setPendingUser(user)}>
                  {user.username} (Iniciar chat)
                </li>
              ))}
            </ul>
            {pendingUser && (
              <div className="confirmation-box">
                <p>Enviar solicitud a <strong>{pendingUser.username}</strong>?</p>
                <button onClick={() => handleStartChat(pendingUser)}>Sí</button>
                <button className="cancel" onClick={() => setPendingUser(null)}>
                  No
                </button>
              </div>
            )}
          </div>
          <div className="chat-requests">
            <h3>Solicitudes de Chat</h3>
            <ul>
              {chatRequests.map((req) => (
                <li key={req._id} className="chat-request-item">
                  <span>{req.initiatedBy ? req.initiatedBy.username : 'Usuario'}</span>
                  <button onClick={() => handleAcceptChat(req)}>Aceptar</button>
                </li>
              ))}
              {chatRequests.length === 0 && <p className="no-requests">No hay nuevas solicitudes.</p>}
            </ul>
          </div>

          <h3>Grupos</h3>
          <ul className="group-list">
            {groupChats.map((conv) => {
              const count = (conv.unreadCounts && conv.unreadCounts[userId]) || 0;
              return (
                <li 
                  key={conv._id}
                  onClick={() => handleSelectChat(conv)}
                  className={selectedChat?._id === conv._id ? 'selected' : ''}
                >
                  <span className="conv-name-wrapper">
                    <img src={conv.groupPictureUrl || DEFAULT_GROUP_PIC} alt="Grupo" className="avatar-in-list offline" />
                    <span className="conv-name">{conv.groupName}</span>
                  </span>
                  {count > 0 && <span className="unread-badge">{count}</span>}
                </li>
              );
            })}
            {groupChats.length === 0 && <p className="no-requests">No hay grupos.</p>}
          </ul>

          <h3>Conversaciones</h3>
          <ul>
            {conversations.map((conv) => {
              const otherUser = getOtherParticipant(conv.participants);
              const displayName = otherUser ? otherUser.username : 'Usuario';
              const isOnline = otherUser && onlineUsersMap.hasOwnProperty(String(otherUser._id));
              
              const count = (conv.unreadCounts && conv.unreadCounts[userId]) || 0;
              const avatarUrl = (otherUser && otherUser.profilePictureUrl) || DEFAULT_PROFILE_PIC;
              
              return (
                <li 
                  key={conv._id}
                  onClick={() => handleSelectChat(conv)}
                  className={selectedChat?._id === conv._id ? 'selected' : ''}
                >
                  <span className="conv-name-wrapper">
                    <img 
                      src={avatarUrl} 
                      alt={displayName} 
                      className={`avatar-in-list ${isOnline ? 'online' : 'offline'}`} 
                    />
                    <span className="conv-name">{displayName}</span>
                  </span>
                  {count > 0 && <span className="unread-badge">{count}</span>}
                </li>
              );
            })}
             {conversations.length === 0 && <p className="no-requests">No hay conversaciones.</p>}
          </ul>
        </div>
        <div className="chat-window">
          {selectedChat ? (
            <>
              <div className="chat-window-header">
                <h4>
                  {selectedChat.isGroup 
                    ? selectedChat.groupName 
                    : getOtherParticipant(selectedChat.participants)?.username || 'Usuario'}
                </h4>
                {selectedChat.status === 'active' && (
                  <div className="chat-header-options">
                    
                    {selectedChat.isGroup ? (
                      <button 
                        className="group-settings-btn"
                        onClick={() => setShowGroupSettingsModal(true)}
                      >
                        Ajustes ⚙️
                      </button>
                    ) : (
                      <>
                        <button 
                          className="block-btn"
                          onClick={() => setBlockingUser(getOtherParticipant(selectedChat.participants))}
                        >
                          Bloquear
                        </button>
                        <button 
                          className="delete-btn"
                          onClick={() => setDeletingConv(selectedChat)}
                        >
                          Eliminar Chat
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
              
              {selectedChat.status === 'active' ? (
                <>
                  <div className="message-list">
                    {messages.map((msg, index) => {
                      
                      if (msg.type === 'system') {
                        return (
                          <div key={msg._id} className="system-message">
                            <span>{msg.content}</span>
                          </div>
                        );
                      }

                      const prevMsg = messages[index - 1];
                      const showAvatar = !prevMsg || prevMsg.type === 'system' || msg.sender._id !== prevMsg.sender._id;
                      
                      return (
                        <div key={msg._id} className={`message ${msg.sender._id === userId ? 'sent' : 'received'}`}>
                          {showAvatar && (
                            <img 
                              src={msg.sender.profilePictureUrl || DEFAULT_PROFILE_PIC}
                              alt={msg.sender.username}
                              className="message-avatar"
                            />
                          )}
                          <div className={`message-content ${showAvatar ? '' : 'no-avatar'}`}>
                            {showAvatar && <strong>{msg.sender.username}</strong>}
                            <p>{msg.content}</p>
                          </div>
                        </div>
                      )
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                  <div className="message-input-area">
                    <input 
                      type="text" 
                      placeholder="Escribe un mensaje..."
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                    />
                    <button onClick={handleSendMessage}>Enviar</button>
                  </div>
                </>
              ) : (
                <p>Este chat está pendiente. Acepta la solicitud para chatear.</p>
              )}
            </>
          ) : (
            <p>Selecciona una conversación o busca un nuevo usuario.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default Chat;