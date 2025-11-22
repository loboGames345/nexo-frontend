// src/components/Chat.js

import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import ProfileUploader from './ProfileUploader'; 

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
const DEFAULT_PROFILE_PIC = 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png';
const DEFAULT_GROUP_PIC = 'https://cdn.pixabay.com/photo/2016/11/14/17/39/group-1824145_1280.png';

function Chat({ token, userId, username, socket, onShowRequestSent, onShowInfo, onlineUsersMap, onAddNotification }) {

  const [chatRequests, setChatRequests] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [groupChats, setGroupChats] = useState([]);

  const [selectedChat, setSelectedChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  
  // --- Estado de Búsqueda ---
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [pendingUser, setPendingUser] = useState(null);
  
  const [myBlockedUsers, setMyBlockedUsers] = useState([]); 
  const [isChatBlocked, setIsChatBlocked] = useState(false);

  // --- Estados de la Interfaz (Acordeón) ---
  const [isGroupsOpen, setIsGroupsOpen] = useState(true); 
  const [isConversationsOpen, setIsConversationsOpen] = useState(true); 

  const [deletingConv, setDeletingConv] = useState(null); 
  const [blockingUser, setBlockingUser] = useState(null); 
  const [unblockingUser, setUnblockingUser] = useState(null);
  const [kickingUser, setKickingUser] = useState(null); 
  const [blockAndUnfriendUser, setBlockAndUnfriendUser] = useState(null);

  const [viewingMember, setViewingMember] = useState(null);

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

  useEffect(() => {
    const fetchBlockedUsers = async () => {
      try {
        const response = await axios.get(`${API_URL}/users/me/blocked`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        setMyBlockedUsers(response.data);
      } catch (error) {
        console.error("Error al cargar bloqueos:", error);
      }
    };
    if (token) {
        fetchBlockedUsers();
    }
  }, [token]);

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
            return String(c.initiatedBy._id) !== String(userId);
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

  useEffect(() => {
    if (!socket || !userId) return;
    if (socket.connected) {
        socket.emit('registerUser', { userId, username });
    }
  }, [socket, userId, username]);

  useEffect(() => {
    if (!socket) return;

    const handleNewRequest = (newRequest) => {
      if (onAddNotification) {
          onAddNotification(`Nueva solicitud de amistad de ${newRequest.initiatedBy.username}`);
      }
      setChatRequests((prevRequests) => {
         if (prevRequests.some(r => r._id === newRequest._id)) return prevRequests;
         if (newRequest.initiatedBy && String(newRequest.initiatedBy._id) === String(userId)) {
             return prevRequests;
         }
         return [...prevRequests, newRequest];
      });
    };
    
    const handleRequestAccepted = (acceptedChat) => {
      const otherUser = acceptedChat.participants.find(p => p._id !== userId);
      const isInitiator = acceptedChat.initiatedBy._id === userId;

      if (isInitiator && otherUser && onAddNotification) {
         onAddNotification(`${otherUser.username} aceptó tu solicitud de chat.`);
      }
      setConversations((prevConversations) => {
         if (prevConversations.some(c => c._id === acceptedChat._id)) return prevConversations;
         return [...prevConversations, acceptedChat];
      });
    };

    const handleNewGroup = (newGroup) => {
      if (onAddNotification) {
         onAddNotification(`Has sido añadido al grupo: "${newGroup.groupName}"`);
      }
      setGroupChats((prevGroups) => {
        if (prevGroups.some(g => g._id === newGroup._id)) {
          return prevGroups;
        }
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

    const handleConversationDeleted = (deletedId) => {
        setConversations((prev) => prev.filter(c => c._id !== deletedId));
        setChatRequests((prev) => prev.filter(c => c._id !== deletedId));
        
        if (selectedChat && selectedChat._id === deletedId) {
            setSelectedChat(null);
            setMessages([]);
            if (onShowInfo) onShowInfo("El usuario ha eliminado su cuenta.");
        }
    };

    const handleChatReadded = (chat) => {
        const otherUser = chat.participants.find(p => p._id !== userId);
        if (otherUser && onAddNotification) {
            onAddNotification(`${otherUser.username} te ha vuelto a agregar.`);
        }
        setConversations(prev => {
            if (prev.some(c => c._id === chat._id)) return prev;
            return [chat, ...prev];
        });
    };

    const handleBlockedBy = ({ blockerName, blockerId }) => {
        if (onAddNotification) {
            onAddNotification(`${blockerName} te ha bloqueado.`);
        }
        setConversations(prev => prev.map(c => {
            const other = getOtherParticipant(c.participants);
            if(other && other._id === blockerId) {
                return { ...c, hasBlock: true };
            }
            return c;
        }));
        if (selectedChat && !selectedChat.isGroup) {
            const otherUser = getOtherParticipant(selectedChat.participants);
            if (otherUser && otherUser.username === blockerName) {
                setIsChatBlocked(true);
            }
        }
    };

    const handleUnblockedBy = ({ blockerName, blockerId }) => {
        setConversations(prev => prev.map(c => {
            const other = getOtherParticipant(c.participants);
            if(other && other._id === blockerId) {
                return { ...c, hasBlock: false };
            }
            return c;
        }));
        if (selectedChat && !selectedChat.isGroup) {
            const otherUser = getOtherParticipant(selectedChat.participants);
            if (otherUser && otherUser.username === blockerName) {
                checkBlockStatus(otherUser._id);
            }
        }
    };

    const handleUnfriendedBy = ({ unfrienderName }) => {
        if (onAddNotification) {
            onAddNotification(`${unfrienderName} te ha desagregado.`);
        }
    };

    const handleUserProfileUpdated = (updatedUser) => {
        setConversations(prev => prev.map(conv => ({
            ...conv,
            participants: conv.participants.map(p => 
                p._id === updatedUser.userId 
                ? { ...p, username: updatedUser.username, bio: updatedUser.bio, profilePictureUrl: updatedUser.profilePictureUrl }
                : p
            )
        })));
        setGroupChats(prev => prev.map(conv => ({
            ...conv,
            participants: conv.participants.map(p => 
                p._id === updatedUser.userId 
                ? { ...p, username: updatedUser.username, bio: updatedUser.bio, profilePictureUrl: updatedUser.profilePictureUrl }
                : p
            )
        })));
        setSelectedChat(prev => {
            if (!prev) return null;
            const isParticipant = prev.participants.some(p => p._id === updatedUser.userId);
            if (!isParticipant) return prev;
            return {
                ...prev,
                participants: prev.participants.map(p => 
                    p._id === updatedUser.userId 
                    ? { ...p, username: updatedUser.username, bio: updatedUser.bio, profilePictureUrl: updatedUser.profilePictureUrl }
                    : p
                )
            };
        });
    };

    socket.on('newChatRequest', handleNewRequest);
    socket.on('chatRequestAccepted', handleRequestAccepted);
    socket.on('chatReadded', handleChatReadded);
    socket.on('newGroupChat', handleNewGroup);
    socket.on('conversationUpdated', handleConversationUpdated);
    socket.on('conversationDeleted', handleConversationDeleted);
    socket.on('blockedBy', handleBlockedBy);
    socket.on('unblockedBy', handleUnblockedBy);
    socket.on('unfriendedBy', handleUnfriendedBy);
    socket.on('userProfileUpdated', handleUserProfileUpdated);

    return () => {
      socket.off('newChatRequest', handleNewRequest);
      socket.off('chatRequestAccepted', handleRequestAccepted);
      socket.off('chatReadded', handleChatReadded);
      socket.off('newGroupChat', handleNewGroup);
      socket.off('conversationUpdated', handleConversationUpdated);
      socket.off('conversationDeleted', handleConversationDeleted);
      socket.off('blockedBy', handleBlockedBy);
      socket.off('unblockedBy', handleUnblockedBy);
      socket.off('unfriendedBy', handleUnfriendedBy);
      socket.off('userProfileUpdated', handleUserProfileUpdated);
    };
  }, [socket, onShowInfo, selectedChat, userId, onAddNotification]);
  
  useEffect(() => {
    if (!socket) return;
    const handleNewMessage = (incomingMessage) => {
      if (incomingMessage.type === 'system') {
          if (!incomingMessage.content.startsWith(username) && onAddNotification) {
             onAddNotification(`Sistema: ${incomingMessage.content}`);
          }
      }
      if (incomingMessage.conversationId === selectedChat?._id) {
        setMessages((prevMessages) => {
            if (prevMessages.some(m => m._id === incomingMessage._id)) return prevMessages;
            return [...prevMessages, incomingMessage];
        });
      }
    };
    socket.on('newMessage', handleNewMessage);
    return () => {
      socket.off('newMessage', handleNewMessage);
    };
  }, [socket, selectedChat, username, onAddNotification]);
  
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

  const checkBlockStatus = async (otherUserId) => {
      try {
          const response = await axios.get(`${API_URL}/users/${otherUserId}/check-block`, {
              headers: { 'Authorization': `Bearer ${token}` }
          });
          const { iBlockedThem, theyBlockedMe } = response.data;
          setIsChatBlocked(iBlockedThem || theyBlockedMe);
      } catch (error) {
          console.error("Error checking block status", error);
      }
  };

  const handleSelectChat = async (conversation) => {
    if (conversation.status !== 'active') {
       setSelectedChat(conversation);
       setMessages([]);
       return; 
    }
    setSelectedChat(conversation);
    setInviteMembers([]);
    setTempGroupName(conversation.groupName || '');
    setIsChatBlocked(false);

    if (!conversation.isGroup) {
        const otherUser = getOtherParticipant(conversation.participants);
        if (otherUser) {
            await checkBlockStatus(otherUser._id);
        }
    }
    
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

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedChat || selectedChat.status !== 'active') return;
    if (isChatBlocked) return; 

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

  const closeSearchModal = () => {
    setShowSearchModal(false);
    setSearchQuery('');
    setSearchResults([]);
    setPendingUser(null);
  }

  const handleStartChat = async (otherUser) => {
    try {
      const response = await axios.post(
        `${API_URL}/conversations`,
        { otherUsername: otherUser.username },
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      const newConversation = response.data;
      
      closeSearchModal();

      if (response.status === 201) {
         onShowRequestSent(otherUser.username);
      } else if (response.status === 200) {
        const existingConversation = response.data;
        
        setConversations(prev => {
            if (prev.some(c => c._id === existingConversation._id)) return prev;
            return [existingConversation, ...prev];
        });

        if (existingConversation.status === 'active') {
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
  
  const handleConfirmBlock = async () => {
    if (!blockingUser) return;
    try {
      const response = await axios.post(
        `${API_URL}/users/${blockingUser._id}/block`,
        {},
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      onShowInfo(response.data.message);
      setMyBlockedUsers(prev => [...prev, blockingUser._id]);
      
      setConversations(prev => prev.map(c => {
          const other = getOtherParticipant(c.participants);
          if(other && other._id === blockingUser._id) {
              return { ...c, hasBlock: true };
          }
          return c;
      }));

      setIsChatBlocked(true);
      setBlockingUser(null);
    } catch (error) {
      console.error("Error al bloquear usuario:", error);
      onShowInfo(error.response.data.message || "No se pudo bloquear al usuario.");
      setBlockingUser(null);
    }
  };

  const handleConfirmUnblock = async () => {
    if (!unblockingUser) return;
    try {
      const response = await axios.delete(
        `${API_URL}/users/${unblockingUser._id}/block`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      onShowInfo(response.data.message);
      setMyBlockedUsers(prev => prev.filter(id => id !== unblockingUser._id));
      
      setConversations(prev => prev.map(c => {
          const other = getOtherParticipant(c.participants);
          if(other && other._id === unblockingUser._id) {
              return { ...c, hasBlock: false };
          }
          return c;
      }));

      await checkBlockStatus(unblockingUser._id);
      setUnblockingUser(null);
    } catch (error) {
      console.error("Error al desbloquear:", error);
      onShowInfo("Error al desbloquear.");
      setUnblockingUser(null);
    }
  };

  const handleConfirmBlockAndUnfriend = async () => {
    if (!blockAndUnfriendUser) return;
    
    const chatIdToDelete = selectedChat._id;

    try {
        await axios.post(
            `${API_URL}/users/${blockAndUnfriendUser._id}/block`,
            {},
            { headers: { 'Authorization': `Bearer ${token}` } }
        );

        await axios.delete(
            `${API_URL}/conversations/${chatIdToDelete}`,
            { headers: { 'Authorization': `Bearer ${token}` } }
        );

        setMyBlockedUsers(prev => [...prev, blockAndUnfriendUser._id]);
        setConversations(prev => prev.filter(c => c._id !== chatIdToDelete));
        
        setSelectedChat(null);
        setMessages([]);
        setBlockAndUnfriendUser(null);
        setShowGroupSettingsModal(false);

        onShowInfo("Usuario bloqueado y desagregado correctamente.");

    } catch (error) {
        console.error("Error en Block & Unfriend:", error);
        onShowInfo("Hubo un error al procesar la solicitud.");
        setBlockAndUnfriendUser(null);
    }
  };

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
        setKickingUser(null); 
    }
  }

  const handleGroupPicUpdate = (newUrl) => {
     setSelectedChat(prev => ({ ...prev, groupPictureUrl: newUrl }));
     setGroupChats(prev => prev.map(g => 
        g._id === selectedChat._id ? { ...g, groupPictureUrl: newUrl } : g
     ));
     onShowInfo("¡Foto de grupo actualizada!");
  };
  
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

  const getOtherParticipant = (participants) => {
    if (!participants) return null; 
    return participants.find(p => p.username !== username) || null;
  };

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
    <div className={`chat-container ${selectedChat ? 'chat-active' : ''}`}>
      
      {/* MODAL DE BÚSQUEDA DE USUARIOS */}
      {showSearchModal && (
        <div className="modal-overlay top-priority-modal">
          <div className="modal-content" style={{maxHeight: '80vh', display: 'flex', flexDirection: 'column'}}>
             <h2>Buscar Usuarios</h2>
             <div className="search-area" style={{border: 'none', padding: '0 0 10px 0'}}>
                <input 
                  type="text" 
                  placeholder="Escribe un nombre..." 
                  value={searchQuery} 
                  onChange={handleSearch}
                  autoFocus
                />
             </div>
             
             <ul className="search-results">
                {searchResults.map(user => (
                  <li key={user._id} className="search-result-item">
                    <img 
                      src={user.profilePictureUrl || DEFAULT_PROFILE_PIC} 
                      alt={user.username} 
                      className="search-avatar"
                    />
                    <div className="search-info">
                      <span className="search-username">{user.username}</span>
                      <span className="search-bio">
                        {user.bio ? (user.bio.length > 30 ? user.bio.substring(0, 30) + '...' : user.bio) : "Sin presentación"}
                      </span>
                    </div>
                    <button 
                      className="search-add-btn"
                      onClick={() => setPendingUser(user)}
                    >
                      Agregar +
                    </button>
                  </li>
                ))}
                {searchQuery && searchResults.length === 0 && (
                    <li className="no-results">No se encontraron usuarios.</li>
                )}
             </ul>
             
             {pendingUser && (
              <div className="search-confirm-overlay">
                <div className="search-confirm-card">
                    <img 
                        src={pendingUser.profilePictureUrl || DEFAULT_PROFILE_PIC} 
                        alt={pendingUser.username} 
                        className="confirm-avatar-large"
                    />
                    <h3 className="confirm-title">¿Conectar con {pendingUser.username}?</h3>
                    <p className="confirm-subtitle">Se enviará una solicitud de amistad.</p>
                    
                    <div className="confirm-actions">
                        <button className="btn-confirm-yes" onClick={() => handleStartChat(pendingUser)}>
                            Enviar Solicitud
                        </button>
                        <button className="btn-confirm-no" onClick={() => setPendingUser(null)}>
                            Cancelar
                        </button>
                    </div>
                </div>
              </div>
             )}

             <div className="modal-buttons single-button" style={{marginTop: '15px'}}>
                <button className="confirm-logout" onClick={closeSearchModal}>Cerrar</button>
             </div>
          </div>
        </div>
      )}
      
      {/* --- MODALES DE CONFIRMACIÓN Y ACCIÓN --- */}
      {deletingConv && (
        <div className="modal-overlay priority-modal">
          <div className="modal-content delete-conv">
            <h2>{deletingConv.isGroup ? 'Salir del Grupo' : 'Desagregar Usuario'}</h2>
            <p>
              {deletingConv.isGroup 
                ? `¿Seguro que quieres salir de ${deletingConv.groupName}?`
                : `¿Seguro que quieres desagregar a ${getOtherParticipant(deletingConv.participants)?.username}?`
              }
            </p>
            {!deletingConv.isGroup && (
                <p style={{fontSize: '0.9em', color: '#666'}}>
                    Esto eliminará el chat de tu lista. La otra persona conservará el historial, pero si te envía un mensaje, no te llegará ni reaparecerá el chat hasta que vuelvas a agregarlo.
                </p>
            )}
            <div className="modal-buttons">
              <button className="confirm-delete" onClick={confirmDeleteOrLeave}>
                  {deletingConv.isGroup ? 'Sí, salir' : 'Sí, desagregar'}
              </button>
              <button className="cancel-delete" onClick={() => setDeletingConv(null)}>No, cancelar</button>
            </div>
          </div>
        </div>
      )}
      
      {blockingUser && (
        <div className="modal-overlay priority-modal">
          <div className="modal-content delete-conv">
            <h2>Bloquear Usuario</h2>
            <p>¿Seguro que quieres bloquear a <strong>{blockingUser.username}</strong>?</p>
            <p>No podrás recibir mensajes de este usuario hasta que lo desbloquees manualmente.</p>
            <div className="modal-buttons">
              <button className="confirm-delete" onClick={handleConfirmBlock}>Sí, bloquear</button>
              <button className="cancel-delete" onClick={() => setBlockingUser(null)}>No, cancelar</button>
            </div>
          </div>
        </div>
      )}

      {unblockingUser && (
        <div className="modal-overlay priority-modal">
          <div className="modal-content success">
            <h2>Desbloquear Usuario</h2>
            <p>¿Quieres desbloquear a <strong>{unblockingUser.username}</strong>?</p>
            <div className="modal-buttons">
              <button className="confirm-logout" onClick={handleConfirmUnblock}>Sí, desbloquear</button>
              <button className="cancel-delete" onClick={() => setUnblockingUser(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {blockAndUnfriendUser && (
        <div className="modal-overlay priority-modal">
            <div className="modal-content delete-conv">
                <h2>Bloquear y Desagregar</h2>
                <p>¿Estás seguro de que quieres bloquear y desagregar a <strong>{blockAndUnfriendUser.username}</strong>?</p>
                <p style={{fontWeight: 'bold', color: '#dc3545', marginTop: '10px'}}>
                    ADVERTENCIA: Ya no habrá forma de que ninguno de los 2 se pueda volver a agregar.
                </p>
                <div className="modal-buttons">
                    <button className="confirm-delete" onClick={handleConfirmBlockAndUnfriend}>
                        Confirmar
                    </button>
                    <button className="cancel-delete" onClick={() => setBlockAndUnfriendUser(null)}>
                        Cancelar
                    </button>
                </div>
            </div>
        </div>
      )}

      {viewingMember && (
        <div className="modal-overlay top-priority-modal">
            <div className="modal-content profile-modal">
                <h2>Perfil de Usuario</h2>
                <div className="profile-avatar-wrapper">
                    <img 
                        src={viewingMember.profilePictureUrl || DEFAULT_PROFILE_PIC} 
                        alt="Perfil"
                        className="profile-modal-avatar"
                        style={{cursor: 'default'}} 
                    />
                </div>
                <h3>{viewingMember.username}</h3>
                <p style={{fontStyle: 'italic', color: '#777', marginTop: '10px'}}>
                    {viewingMember.bio || "Sin presentación."}
                </p>
                
                <div className="modal-buttons single-button" style={{marginTop: '25px'}}>
                    <button className="confirm-logout" onClick={() => setViewingMember(null)}>
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
      )}

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
                <p>No tienes amigos para invitar.</p>
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
                            style={{cursor: 'pointer'}}
                            onClick={() => setViewingMember(member)} 
                        />
                        <span 
                            className="conv-name"
                            style={{cursor: 'pointer', textDecoration: 'underline'}}
                            onClick={() => setViewingMember(member)} 
                        >
                            {member.username}
                        </span>
                        
                        {isThisMemberFounder ? (
                             <span className="admin-tag" style={{color: 'gold'}}> (Fundador)</span>
                        ) : isThisMemberAdmin ? (
                             <span className="admin-tag"> (Admin)</span>
                        ) : null}
                    </div>
                    
                    {!isMe && (
                      <>
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
                      {friendsToInvite.map(friend => (
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
                      ))}
                    </ul>
                    <button 
                      className="invite-btn" 
                      onClick={handleInviteMembers}
                      disabled={!inviteMembers.length}
                    >
                      Añadir ({inviteMembers.length})
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
            <h2>
                {selectedChat.isGroup ? 'Ajustes del Grupo' : 'Perfil y Ajustes'}
            </h2>
            
            {selectedChat.isGroup ? (
              <>
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
              </>
            ) : (
              <>
                <img 
                  src={getOtherParticipant(selectedChat.participants)?.profilePictureUrl || DEFAULT_PROFILE_PIC} 
                  alt="Perfil" 
                  className="profile-modal-avatar"
                  style={{cursor: 'default'}}
                />
                <h3>{getOtherParticipant(selectedChat.participants)?.username}</h3>
                <p style={{fontStyle: 'italic', color: '#777', margin: '0 0 20px 0'}}>{getOtherParticipant(selectedChat.participants)?.bio || "Sin presentación."}</p>
              </>
            )}
            
            <div className="group-settings-buttons">
              
              {selectedChat.isGroup ? (
                <>
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
                </>
              ) : (
                <>
                  {(() => {
                      const otherUser = getOtherParticipant(selectedChat.participants);
                      if (otherUser && myBlockedUsers.includes(otherUser._id)) {
                          return (
                              <button 
                                className="block-btn" 
                                style={{backgroundColor: '#28a745'}} 
                                onClick={() => {
                                  setUnblockingUser(otherUser);
                                  setShowGroupSettingsModal(false);
                                }}
                              >
                                Desbloquear Usuario
                              </button>
                          );
                      } else {
                          return (
                              <button 
                                className="block-btn"
                                onClick={() => {
                                  setBlockingUser(otherUser);
                                  setShowGroupSettingsModal(false);
                                }}
                              >
                                Bloquear Usuario
                              </button>
                          );
                      }
                  })()}

                  <button 
                    className="delete-btn"
                    onClick={() => {
                      setDeletingConv(selectedChat);
                      setShowGroupSettingsModal(false);
                    }}
                  >
                    Desagregar Usuario
                  </button>

                  {(() => {
                      const otherUser = getOtherParticipant(selectedChat.participants);
                      if (otherUser && !myBlockedUsers.includes(otherUser._id)) {
                        return (
                          <button 
                            className="delete-btn"
                            style={{backgroundColor: '#dc3545', color: 'white', borderColor: '#dc3545', marginTop: '10px'}}
                            onClick={() => {
                                setBlockAndUnfriendUser(otherUser);
                                setShowGroupSettingsModal(false);
                            }}
                          >
                            Bloquear y Desagregar
                          </button>
                        );
                      }
                      return null;
                  })()}
                </>
              )}

            </div>
            
            <div className={`modal-buttons ${selectedChat.isGroup && canEditGroup ? '' : 'single-button'}`}>
              {selectedChat.isGroup && canEditGroup && (
                <button 
                  className="confirm-logout" 
                  onClick={handleSaveGroupDetails}
                  disabled={isGroupLoading}
                >
                  {isGroupLoading ? 'Guardando...' : 'Guardar'}
                </button>
              )}
              <button className="cancel-delete" onClick={() => setShowGroupSettingsModal(false)}>
                {selectedChat.isGroup && canEditGroup ? 'Cancelar' : 'Cerrar'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      
      <div className={`chat-layout ${selectedChat ? 'chat-active' : ''}`}>
        <div className="conversations-list">
          
          <div className="create-group-wrapper">
            <button className="create-group-btn" onClick={() => setShowCreateGroupModal(true)}>
              Crear Grupo +
            </button>
          </div>
          
          <div className="search-btn-wrapper" style={{padding: '10px', borderBottom: '1px solid var(--border-color)'}}>
            <button 
                className="create-group-btn" 
                style={{backgroundColor: 'var(--accent-primary)'}}
                onClick={() => setShowSearchModal(true)}
            >
                Buscar Usuarios 🔍
            </button>
          </div>

          <div 
             className="section-header" 
             onClick={() => setIsGroupsOpen(!isGroupsOpen)}
             style={{
                padding: '15px', 
                borderBottom: '1px solid var(--border-color)', 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                cursor: 'pointer',
                backgroundColor: 'var(--bg-tertiary)',
                fontWeight: 'bold',
                color: 'var(--text-secondary)',
                fontSize: '0.9rem',
                letterSpacing: '1px'
             }}
          >
             <span>GRUPOS</span>
             <span>{isGroupsOpen ? '▲' : '▼'}</span>
          </div>
          
          {isGroupsOpen && (
             <ul className="group-list">
               {groupChats.length === 0 ? (
                  <p className="no-requests" style={{padding: '15px', textAlign: 'center', fontStyle: 'italic', color: '#777'}}>No hay grupos.</p>
               ) : (
                 groupChats.map((conv) => {
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
                 })
               )}
             </ul>
          )}

          <div 
             className="section-header" 
             onClick={() => setIsConversationsOpen(!isConversationsOpen)}
             style={{
                padding: '15px', 
                borderBottom: '1px solid var(--border-color)', 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                cursor: 'pointer',
                backgroundColor: 'var(--bg-tertiary)',
                fontWeight: 'bold',
                color: 'var(--text-secondary)',
                fontSize: '0.9rem',
                letterSpacing: '1px'
             }}
          >
             <span>CONVERSACIONES</span>
             <span>{isConversationsOpen ? '▲' : '▼'}</span>
          </div>

          {isConversationsOpen && (
             <ul className="conversation-list-ul">
               {conversations.length === 0 ? (
                  <p className="no-requests" style={{padding: '15px', textAlign: 'center', fontStyle: 'italic', color: '#777'}}>No hay conversaciones.</p>
               ) : (
                 conversations.map((conv) => {
                    const otherUser = getOtherParticipant(conv.participants);
                    const displayName = otherUser ? otherUser.username : 'Usuario';
                    
                    const hasBlock = conv.hasBlock; 
                    const isOnline = !hasBlock && otherUser && onlineUsersMap.hasOwnProperty(String(otherUser._id));
                    
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
                 })
               )}
             </ul>
          )}

        </div>

        <div className="chat-window">
          {selectedChat ? (
            <>
              <div className="chat-window-header">
                {/* --- BOTÓN ATRÁS (MÓVIL) --- */}
                <button className="back-button" onClick={() => setSelectedChat(null)}>⬅</button>

                <h4>
                  {selectedChat.isGroup 
                    ? selectedChat.groupName 
                    : getOtherParticipant(selectedChat.participants)?.username || 'Usuario'}
                </h4>
                {selectedChat.status === 'active' && (
                  <div className="chat-header-options">
                    <button 
                      className="group-settings-btn"
                      onClick={() => setShowGroupSettingsModal(true)}
                    >
                      {selectedChat.isGroup ? 'Ajustes ⚙️' : 'Perfil ⚙️'}
                    </button>
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
                      placeholder={isChatBlocked ? "No puedes escribir en este chat." : "Escribe un mensaje..."}
                      value={newMessage}
                      disabled={isChatBlocked}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                      style={isChatBlocked ? {backgroundColor: '#f0f0f0', cursor: 'not-allowed'} : {}}
                    />
                    <button onClick={handleSendMessage} disabled={isChatBlocked}>Enviar</button>
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