// src/components/Chat.js

import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import ProfileUploader from './ProfileUploader';
import Picker from '@emoji-mart/react';
import i18n from '@emoji-mart/data/i18n/es.json';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
const DEFAULT_PROFILE_PIC = 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png';
const DEFAULT_GROUP_PIC = 'https://cdn.pixabay.com/photo/2016/11/14/17/39/group-1824145_1280.png';

function Chat({ token, userId, username, socket, onShowRequestSent, onShowInfo, onlineUsersMap, onAddNotification }) {

  const docInputRef = useRef(null);

  // --- ESTADOS PRINCIPALES ---
  const [chatRequests, setChatRequests] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [groupChats, setGroupChats] = useState([]);

  const [selectedChat, setSelectedChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  
// --- ESTADOS PARA SCROLL INTELIGENTE ---
  const [initialUnreadCount, setInitialUnreadCount] = useState(0); // Recuerda cuántos había
  const unreadMarkerRef = useRef(null); // Referencia invisible para hacer scroll

  // --- ESTADO PARA MODAL DE BORRADO MASIVO ---
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  // --- ESTADOS PARA ARCHIVOS Y VISOR ---
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [isSending, setIsSending] = useState(false);
  const fileInputRef = useRef(null);

  // Estado del Visor de Imágenes (Lightbox)
  const [expandedMedia, setExpandedMedia] = useState(null); 
  const [showMediaOptions, setShowMediaOptions] = useState(false);
  
  // --- ESTADOS DE BORRADO MASIVO ---
  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [selectedMsgIds, setSelectedMsgIds] = useState([]);

  // --- ESTADOS DE BÚSQUEDA ---
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [pendingUser, setPendingUser] = useState(null);
  
  // --- ESTADOS DE BLOQUEO ---
  const [myBlockedUsers, setMyBlockedUsers] = useState([]); 
  const [isChatBlocked, setIsChatBlocked] = useState(false);

  // --- ESTADOS DE INTERFAZ (ACORDEÓN) ---
  const [isGroupsOpen, setIsGroupsOpen] = useState(true); 
  const [isConversationsOpen, setIsConversationsOpen] = useState(true); 

  // --- ESTADOS DE MODALES DE ACCIÓN ---
  const [deletingConv, setDeletingConv] = useState(null); 
  const [blockingUser, setBlockingUser] = useState(null); 
  const [unblockingUser, setUnblockingUser] = useState(null);
  const [kickingUser, setKickingUser] = useState(null); 
  const [blockAndUnfriendUser, setBlockAndUnfriendUser] = useState(null);

  const [viewingMember, setViewingMember] = useState(null);

  // --- ESTADOS DE GESTIÓN DE GRUPOS ---
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

  // --- NUEVO ESTADO PARA EMOJIS ---
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // --- FUNCIÓN PARA AGREGAR EMOJI AL INPUT ---
  const onEmojiClick = (emojiObject) => {
    // En Emoji Mart, el emoji viene en emojiObject.native
    setNewMessage(prev => prev + emojiObject.native);
  };

// --- SCROLL INTELIGENTE ---
  useEffect(() => {
    if (initialUnreadCount > 0 && unreadMarkerRef.current) {
        unreadMarkerRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
        scrollToBottom();
    }
  }, [messages, previews, initialUnreadCount]);

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

  // --- SOCKET LISTENERS ---
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
        const updateList = (list) => list.map(conv => ({
            ...conv,
            participants: conv.participants.map(p => 
                p._id === updatedUser.userId 
                ? { ...p, username: updatedUser.username, bio: updatedUser.bio, profilePictureUrl: updatedUser.profilePictureUrl }
                : p
            )
        }));
        
        setConversations(prev => updateList(prev));
        setGroupChats(prev => updateList(prev));
        
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

    // --- LISTENER PARA ACTUALIZAR MENSAJES (SOFT DELETE) ---
    const handleMessageUpdated = (updatedMsg) => {
        if (selectedChat && selectedChat._id === updatedMsg.conversationId) {
            setMessages(prev => prev.map(m => m._id === updatedMsg._id ? updatedMsg : m));
            
            // Si el mensaje actualizado es el que se está viendo expandido, cerrar el visor
            if (expandedMedia && expandedMedia.messageId === updatedMsg._id) {
                closeExpandedView();
                onShowInfo("Este mensaje ha sido eliminado por el usuario.");
            }
        }
    };

    // --- LISTENER PARA BULK UPDATE ---
    const handleMessagesBulkUpdated = (updatedMessagesList) => {
        if (selectedChat && updatedMessagesList.length > 0 && updatedMessagesList[0].conversationId === selectedChat._id) {
            setMessages(prevMessages => {
                return prevMessages.map(msg => {
                    const updated = updatedMessagesList.find(u => u._id === msg._id);
                    return updated ? updated : msg;
                });
            });
        }
    };

    const handleMessageDeleted = ({ messageId, conversationId }) => {
        if (selectedChat && selectedChat._id === conversationId) {
            setMessages(prev => prev.filter(m => m._id !== messageId));
        }
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
    socket.on('messageDeleted', handleMessageDeleted); 
    socket.on('messageUpdated', handleMessageUpdated); 
    socket.on('messagesBulkUpdated', handleMessagesBulkUpdated);

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
      socket.off('messageDeleted', handleMessageDeleted);
      socket.off('messageUpdated', handleMessageUpdated);
      socket.off('messagesBulkUpdated', handleMessagesBulkUpdated);
    };
  }, [socket, onShowInfo, selectedChat, userId, onAddNotification, expandedMedia]);
  
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

  // --- FUNCIONES AUXILIARES ---

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
    // 1. Si no es activo, solo lo seleccionamos
    if (conversation.status !== 'active') {
       setSelectedChat(conversation);
       setMessages([]);
       setInitialUnreadCount(0); // Reset
       return; 
    }

    // 2. CAPTURAR EL CONTADOR ANTES DE QUE SE BORRE
    const currentUnread = (conversation.unreadCounts && conversation.unreadCounts[userId]) || 0;
    setInitialUnreadCount(currentUnread);

    setSelectedChat(conversation);
    setInviteMembers([]);
    setTempGroupName(conversation.groupName || '');
    setIsChatBlocked(false);
    
    // Limpiar estados al cambiar de chat
    setSelectedFiles([]);
    setPreviews([]);
    setIsDeleteMode(false);
    setSelectedMsgIds([]);

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

  // --- FUNCIONES PARA MANEJO DE ARCHIVOS ---

const handleFileSelect = (e, isDoc = false) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    // Validación 1: Máximo de archivos
    if (files.length + selectedFiles.length > 5) {
        onShowInfo("Máximo 5 archivos por mensaje.");
        return;
    }

    // Validación 2: Seguridad (.exe)
    const hasExe = files.some(f => f.name.toLowerCase().endsWith('.exe'));
    if (hasExe) {
        onShowInfo("No se permiten archivos ejecutables (.exe).");
        return;
    }

    // Validación 3: Si es DOCUMENTO, no permitir imágenes/videos
    if (isDoc) {
        const hasMedia = files.some(f => f.type.startsWith('image/') || f.type.startsWith('video/'));
        if (hasMedia) {
            onShowInfo("Para imágenes y videos, por favor usa el botón de cámara 📷.");
            // Limpiamos el input para que pueda intentar de nuevo
            if(docInputRef.current) docInputRef.current.value = "";
            return;
        }
    }

    setSelectedFiles(prev => [...prev, ...files]);

    const newPreviews = files.map(file => {
        let type = 'image';
        if (file.type.startsWith('video/')) type = 'video';
        else if (!file.type.startsWith('image/')) type = 'document';

        return {
            url: type === 'document' ? null : URL.createObjectURL(file),
            type: type,
            name: file.name
        };
    });
    setPreviews(prev => [...prev, ...newPreviews]);
  };

  const clearFiles = () => {
    setSelectedFiles([]);
    setPreviews([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSendMessage = async () => {
    if ((!newMessage.trim() && selectedFiles.length === 0) || !selectedChat || selectedChat.status !== 'active') return;
    if (isChatBlocked) return; 

    setIsSending(true);

    try {
      if (selectedFiles.length > 0) {
        const formData = new FormData();
        formData.append('content', newMessage);
        selectedFiles.forEach(file => {
            formData.append('files', file);
        });

        await axios.post(
            `${API_URL}/conversations/${selectedChat._id}/messages/media`,
            formData,
            { headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'multipart/form-data'
            }}
        );
        clearFiles();
      } else {
        // ENVIAR SOLO TEXTO (JSON)
        await axios.post(
            `${API_URL}/conversations/${selectedChat._id}/messages`,
            { content: newMessage },
            { headers: { 'Authorization': `Bearer ${token}` } }
        );
      }
      
      setNewMessage('');
    } catch (error) {
      console.error("Error al enviar mensaje:", error);
      
      // MEJORA: Mostrar el mensaje real del servidor si existe
      if (error.response && error.response.data && error.response.data.message) {
        onShowInfo(error.response.data.message);
      } else {
        onShowInfo("Error al enviar el mensaje. Revisa tu conexión o el tamaño del archivo.");
      }
    } finally {
        setIsSending(false);
    }
  };

  // --- FUNCIONES PARA VISOR DE MEDIOS ---

  const handleExpandMedia = (url, type, messageId, senderId) => {
    setExpandedMedia({ url, type, messageId, senderId });
    setShowMediaOptions(false);
  };

  const closeExpandedView = () => {
    setExpandedMedia(null);
    setShowMediaOptions(false);
  };

// --- FUNCIÓN PARA OBTENER ICONO SEGÚN EXTENSIÓN ---
  const getFileIconUrl = (fileName) => {
    const ext = fileName.split('.').pop().toLowerCase();
    const baseUrl = 'https://cdn.jsdelivr.net/gh/vscode-icons/vscode-icons/icons/';

    switch (ext) {
        case 'doc': case 'docx': 
            return `${baseUrl}file_type_word.svg`;
        case 'xls': case 'xlsx': case 'csv': 
            return `${baseUrl}file_type_excel.svg`;
        case 'ppt': case 'pptx': 
            return `${baseUrl}file_type_powerpoint.svg`;
        case 'pdf': 
            return `${baseUrl}file_type_pdf.svg`;
        case 'zip': case 'rar': case '7z': case 'tar': case 'gz':
            return `${baseUrl}file_type_zip.svg`;
        case 'txt': 
            return `${baseUrl}file_type_text.svg`;
        case 'js': case 'jsx': 
            return `${baseUrl}file_type_js.svg`;
        case 'html': 
            return `${baseUrl}file_type_html.svg`;
        case 'css': 
            return `${baseUrl}file_type_css.svg`;
        default: 
            return `${baseUrl}default_file.svg`; // Icono genérico para otros
    }
  };

// --- FUNCIÓN PARA DESCARGAR DOCUMENTOS FORZOSAMENTE ---
  const handleDownloadFile = async (url, fileName) => {
    try {
      // 1. Pedimos el archivo como "blob" (datos crudos)
      const response = await fetch(url);
      const blob = await response.blob();
      
      // 2. Creamos un enlace invisible en memoria
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName; // Esto fuerza el nombre y extensión correctos
      
      // 3. Hacemos click y limpiamos
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
      
    } catch (error) {
      console.error("Error al descargar:", error);
      onShowInfo("No se pudo descargar el archivo.");
    }
  };

  const handleDownloadMedia = async () => {
      if (!expandedMedia) return;
      try {
          const response = await fetch(expandedMedia.url);
          const blob = await response.blob();
          const blobUrl = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = blobUrl;
          const ext = expandedMedia.type === 'video' ? 'mp4' : 'jpg';
          link.download = `nexo_media_${Date.now()}.${ext}`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(blobUrl);
          setShowMediaOptions(false);
      } catch (error) {
          console.error("Error al descargar", error);
          onShowInfo("No se pudo descargar el archivo.");
      }
  };

  // --- LÓGICA DE BORRADO MASIVO (NUEVO) ---

  const toggleDeleteMode = () => {
      setIsDeleteMode(true);
      setSelectedMsgIds([]);
      setShowGroupSettingsModal(false); // Cerrar modal de ajustes
  };

  const cancelDeleteMode = () => {
      setIsDeleteMode(false);
      setSelectedMsgIds([]);
  };

  const handleSelectMessage = (msgId) => {
      setSelectedMsgIds(prev => {
          if (prev.includes(msgId)) {
              return prev.filter(id => id !== msgId);
          } else {
              return [...prev, msgId];
          }
      });
  };

// --- PEGAR ESTO DENTRO DE Chat.js (Antes del return) ---

  // 1. Función para abrir el modal al dar click en el botón rojo
  const handleBulkDeleteClick = () => {
      if (selectedMsgIds.length === 0) return;
      setShowBulkDeleteConfirm(true); 
  };

  // 2. Función que ejecuta el borrado real (conectada al botón "Sí" del modal)
  const performBulkDelete = async () => {
      try {
          await axios.post(
              `${API_URL}/messages/bulk-delete`,
              { messageIds: selectedMsgIds },
              { headers: { 'Authorization': `Bearer ${token}` } }
          );
          // Limpieza de estados
          setIsDeleteMode(false);
          setSelectedMsgIds([]);
          setShowBulkDeleteConfirm(false); 
      } catch (error) {
          console.error("Error bulk delete", error);
          onShowInfo("Error al eliminar mensajes.");
          setShowBulkDeleteConfirm(false);
      }
  };

  // Borrado individual desde el visor
  const handleDeleteMessageFromViewer = async () => {
      if (!expandedMedia) return;
      try {
          await axios.delete(
              `${API_URL}/messages/${expandedMedia.messageId}`,
              { headers: { 'Authorization': `Bearer ${token}` } }
          );
          closeExpandedView();
      } catch (error) {
          onShowInfo(error.response?.data?.message || "Error al borrar.");
      }
  };

  // ------------------------------------------------

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
  
{/* --- MODAL CONFIRMACIÓN BORRADO MASIVO --- */}
      {showBulkDeleteConfirm && (
        <div className="modal-overlay priority-modal">
          <div className="modal-content delete-conv">
            <h2>Eliminar Mensajes</h2>
            <p>
              ¿Estás seguro de que quieres eliminar <strong>{selectedMsgIds.length}</strong> mensajes seleccionados?
            </p>
            <p style={{fontSize: '0.85em', color: '#666', marginTop: '5px'}}>
               Se mostrará como "mensaje eliminado" para los demás.
            </p>
            <div className="modal-buttons">
              <button className="confirm-delete" onClick={performBulkDelete}>
                  Sí, eliminar
              </button>
              <button className="cancel-delete" onClick={() => setShowBulkDeleteConfirm(false)}>
                  Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

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

  // --- HELPER PARA RENDERIZAR TEXTO EN NEGRITAS ---
  const renderMessageContent = (text) => {
    if (!text) return null;
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, index) => {
        if (part.startsWith('**') && part.endsWith('**')) {
            return <b key={index}>{part.slice(2, -2)}</b>;
        }
        return part;
    });
  };

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (dateString) => {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    return new Date(dateString).toLocaleDateString('es-ES', options);
  };

  const shouldShowDateSeparator = (currentMsg, prevMsg) => {
    if (!prevMsg) return true;
    const currentDate = new Date(currentMsg.createdAt).toDateString();
    const prevDate = new Date(prevMsg.createdAt).toDateString();
    return currentDate !== prevDate;
  };

  return (
    <div className={`chat-container ${selectedChat ? 'chat-active' : ''}`}>
      
      {/* --- VISOR DE IMÁGENES EXPANDIDO (LIGHTBOX) --- */}
      {expandedMedia && (
        <div className="lightbox-overlay" onClick={closeExpandedView}>
           <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
               {expandedMedia.type === 'video' ? (
                   <video src={expandedMedia.url} controls autoPlay className="lightbox-media" />
               ) : (
                   <img src={expandedMedia.url} alt="Full screen" className="lightbox-media" />
               )}

               <button className="lightbox-close" onClick={closeExpandedView}>×</button>

               {/* Menú de opciones de 3 puntitos */}
               <div className="lightbox-menu-container">
                   <button 
                     className="lightbox-menu-btn" 
                     onClick={() => setShowMediaOptions(!showMediaOptions)}
                   >
                     ⋮
                   </button>
                   {showMediaOptions && (
                       <div className="lightbox-menu-dropdown">
                           <button onClick={handleDownloadMedia}>
                               💾 Guardar
                           </button>
                           {/* Solo mostrar "Eliminar" si yo soy el dueño */}
                           {expandedMedia.senderId === userId && (
                               <button onClick={handleDeleteMessageFromViewer} className="delete-option">
                                   🗑️ Eliminar mensaje
                               </button>
                           )}
                       </div>
                   )}
               </div>
           </div>
        </div>
      )}

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
      
      {showBulkDeleteConfirm && (
        <div className="modal-overlay priority-modal">
          <div className="modal-content delete-conv">
            <h2>Eliminar Mensajes</h2>
            <p>
              ¿Estás seguro de que quieres eliminar <strong>{selectedMsgIds.length}</strong> mensajes seleccionados?
            </p>
            <p style={{fontSize: '0.85em', color: '#666', marginTop: '5px'}}>
               Se mostrará como "mensaje eliminado" para los demás.
            </p>
            <div className="modal-buttons">
              <button className="confirm-delete" onClick={performBulkDelete}>
                  Sí, eliminar
              </button>
              <button className="cancel-delete" onClick={() => setShowBulkDeleteConfirm(false)}>
                  Cancelar
              </button>
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

      {/* --- MODAL CREAR GRUPO (REDISEÑADO) --- */}
      {showCreateGroupModal && (
        <div className="modal-overlay priority-modal">
          {/* Usamos el mismo estilo de contenedor que Búsqueda */}
          <div className="modal-content" style={{maxHeight: '80vh', display: 'flex', flexDirection: 'column'}}>
            <h2>Crear un nuevo grupo</h2>
            
            {/* Input con estilo de búsqueda (search-area) */}
            <div className="search-area" style={{border: 'none', padding: '0 0 10px 0'}}>
              <input 
                type="text"
                placeholder="Nombre del grupo..."
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                autoFocus
              />
            </div>

            <h3 style={{alignSelf: 'flex-start', margin: '10px 0 5px 0', fontSize: '0.9rem', color: 'var(--text-secondary)'}}>
                Selecciona participantes:
            </h3>

            {/* Lista reutilizando estilos de resultados de búsqueda */}
            <ul className="search-results">
              {friendsList.length > 0 ? friendsList.map(friend => {
                const isSelected = newGroupMembers.includes(friend._id);
                return (
                  <li 
                    key={friend._id} 
                    className="search-result-item"
                    // Al hacer click en cualquier parte de la fila, se selecciona
                    onClick={() => handleMemberToggle(friend._id)}
                    style={{
                        cursor: 'pointer', 
                        backgroundColor: isSelected ? 'var(--bg-selected)' : 'transparent',
                        borderLeft: isSelected ? '4px solid var(--accent-primary)' : '4px solid transparent'
                    }}
                  >
                    <img 
                      src={friend.profilePictureUrl || DEFAULT_PROFILE_PIC} 
                      alt={friend.username} 
                      className="search-avatar"
                    />
                    
                    <div className="search-info">
                      <span className="search-username">{friend.username}</span>
                      <span className="search-bio" style={{fontSize: '0.8rem'}}>
                        {friend.bio ? (friend.bio.length > 30 ? friend.bio.substring(0, 30) + '...' : friend.bio) : "Sin presentación"}
                      </span>
                    </div>

                    {/* Checkbox visual a la derecha */}
                    <div style={{ pointerEvents: 'none' }}>
                        <input 
                          type="checkbox"
                          checked={isSelected}
                          readOnly
                          style={{width: '20px', height: '20px', cursor: 'pointer'}}
                        />
                    </div>
                  </li>
                );
              }) : (
                <li className="no-results">No tienes amigos para invitar.</li>
              )}
            </ul>
            
            <div className="modal-buttons" style={{marginTop: '15px'}}>
              <button className="confirm-logout" onClick={handleCreateGroup}>Crear Grupo</button>
              <button className="cancel-delete" onClick={() => setShowCreateGroupModal(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

{/* --- MODAL MIEMBROS DEL GRUPO (ALINEACIÓN CORREGIDA A LA IZQUIERDA) --- */}
      {showMembersModal && selectedChat && (
        <div className="modal-overlay priority-modal">
          <div className="modal-content" style={{maxHeight: '85vh', width: '95%', maxWidth: '600px', display: 'flex', flexDirection: 'column'}}>
            
            <h2 style={{borderBottom: '1px solid var(--border-color)', paddingBottom: '10px', marginBottom: '10px'}}>
                {selectedChat.groupName} <span style={{fontSize: '0.6em', color: 'var(--text-secondary)'}}>({selectedChat.participants.length} miembros)</span>
            </h2>
            
            <ul className="search-results" style={{flex: 1, overflowY: 'auto', marginBottom: '10px'}}>
              {selectedChat.participants.map(member => {
                const isOnline = onlineUsersMap.hasOwnProperty(member._id);
                const avatarUrl = member.profilePictureUrl || DEFAULT_PROFILE_PIC;
                const isThisMemberAdmin = isMemberAdmin(selectedChat, member._id);
                const isThisMemberFounder = isMemberFounder(selectedChat, member._id);
                const isMe = member._id === userId;

                return (
                  <li key={member._id} className="search-result-item" style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
                    
                    {/* IZQUIERDA: Avatar + Info */}
                    <div style={{display: 'flex', alignItems: 'center', flex: 1, minWidth: 0, marginRight: '10px'}}>
                        
                        <div style={{position: 'relative', marginRight: '15px', flexShrink: 0}}>
                            <img 
                                src={avatarUrl} 
                                alt={member.username} 
                                className="search-avatar"
                                style={{cursor: 'pointer', border: isOnline ? '2px solid var(--online-color)' : '2px solid transparent'}}
                                onClick={() => setViewingMember(member)} 
                            />
                        </div>
                        
                        {/* AQUÍ ESTÁ LA CORRECCIÓN: textAlign: 'left' */}
                        <div 
                            className="search-info" 
                            style={{
                                cursor: 'pointer', 
                                overflow: 'hidden', 
                                textAlign: 'left',       
                                alignItems: 'flex-start' 
                            }} 
                            onClick={() => setViewingMember(member)}
                        >
                          <span className="search-username" style={{whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block'}}>
                            {member.username} {isMe && <span style={{fontSize: '0.8em', color: 'var(--text-secondary)'}}>(Tú)</span>}
                          </span>
                          
                          <div style={{display: 'flex', gap: '5px', marginTop: '3px', flexWrap: 'wrap'}}>
                              {isThisMemberFounder && (
                                  <span style={{fontSize: '0.7rem', backgroundColor: '#ffd700', color: '#333', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold', whiteSpace: 'nowrap'}}>
                                    👑 Fundador
                                  </span>
                              )}
                              {isThisMemberAdmin && !isThisMemberFounder && (
                                  <span style={{fontSize: '0.7rem', backgroundColor: 'var(--accent-primary)', color: 'white', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold', whiteSpace: 'nowrap'}}>
                                    🛡️ Admin
                                  </span>
                              )}
                              {!isThisMemberAdmin && !isThisMemberFounder && (
                                 <span className="search-bio" style={{margin: 0}}>Miembro</span>
                              )}
                          </div>
                        </div>
                    </div>

                    {/* DERECHA: Botones */}
                    {!isMe && (
                      <div style={{display: 'flex', gap: '5px', flexShrink: 0}}>
                        {isCurrentUserAdmin && !isThisMemberAdmin && !isThisMemberFounder && (
                            <button className="make-admin-btn" onClick={() => handlePromoteToAdmin(member._id, member.username)} title="Hacer administrador" style={{marginLeft: 0}}>⬆️</button>
                        )}
                        {isCurrentUserFounder && isThisMemberAdmin && !isThisMemberFounder && (
                            <button className="demote-admin-btn" onClick={() => handleDemoteAdmin(member._id, member.username)} title="Quitar administrador" style={{marginLeft: 0, marginRight: 0}}>⬇️</button>
                        )}
                        {((isCurrentUserAdmin && !isThisMemberAdmin) || (isCurrentUserFounder)) && (
                            <button className="kick-btn" onClick={() => handleKickMember(member._id, member.username)} title="Expulsar miembro" style={{marginLeft: 0}}>🚫</button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            
            {/* SECCIÓN AÑADIR (Solo Admins) */}
            {isCurrentUserAdmin && (
              <div className="add-members-section" style={{borderTop: '1px solid var(--border-color)', paddingTop: '10px'}}>
                <h3 
                    onClick={() => setIsInviteSectionOpen(!isInviteSectionOpen)}
                    style={{fontSize: '0.95rem', display: 'flex', justifyContent: 'space-between', cursor: 'pointer', padding: '5px', backgroundColor: 'var(--bg-secondary)', borderRadius: '5px', textAlign: 'left'}}
                >
                  Añadir nuevos miembros
                  <span className="toggle-arrow">{isInviteSectionOpen ? '▲' : '▼'}</span>
                </h3>

                {isInviteSectionOpen && (
                  <div style={{marginTop: '10px'}}>
                    <ul className="search-results" style={{maxHeight: '150px', overflowY: 'auto'}}>
                      {friendsToInvite.length > 0 ? friendsToInvite.map(friend => {
                          const isSelected = inviteMembers.includes(friend._id);
                          return (
                            <li key={friend._id} className="search-result-item" onClick={() => handleInviteToggle(friend._id)} style={{cursor: 'pointer', padding: '8px', backgroundColor: isSelected ? 'var(--bg-selected)' : 'transparent', borderLeft: isSelected ? '3px solid var(--accent-primary)' : '3px solid transparent', display: 'flex', alignItems: 'center'}}>
                                <img src={friend.profilePictureUrl || DEFAULT_PROFILE_PIC} alt={friend.username} className="search-avatar" style={{width: '35px', height: '35px'}} />
                                <span className="search-username" style={{fontSize: '0.9rem', textAlign: 'left'}}>{friend.username}</span>
                                <input type="checkbox" checked={isSelected} readOnly style={{marginLeft: 'auto', pointerEvents: 'none'}} />
                            </li>
                          )
                      }) : (
                          <li className="no-results" style={{padding: '10px', fontSize: '0.8rem'}}>No tienes amigos disponibles para invitar.</li>
                      )}
                    </ul>
                    <button className="invite-btn" onClick={handleInviteMembers} disabled={!inviteMembers.length} style={{marginTop: '10px', width: '100%'}}>Invitar seleccionados ({inviteMembers.length})</button>
                  </div>
                )}
              </div>
            )}
            
            <div className="modal-buttons single-button" style={{marginTop: '15px'}}>
              <button className="cancel-delete" onClick={closeMembersModal}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
      
{/* --- MODAL AJUSTES (LIMPIO) --- */}
      {showGroupSettingsModal && selectedChat && (
        <div className="modal-overlay priority-modal">
          <div className="modal-content profile-modal group-settings-modal"> 
            
            {/* 1. TÍTULO ACTUALIZADO */}
            <h2>
                {selectedChat.isGroup ? 'Ajustes del Grupo' : 'Ajustes'}
            </h2>
            
            {/* 2. CONTENIDO SUPERIOR (Solo para grupos porque es editable) */}
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
                        placeholder="Nombre del grupo"
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
              /* --- AQUÍ ESTÁ EL CAMBIO PRINCIPAL --- */
              /* Si es chat privado, NO mostramos nada de perfil (ni foto, ni nombre, ni bio) */
              /* Dejamos este espacio vacío o nulo */
              null
            )}
            
            {/* 3. BOTONES DE ACCIÓN (Se mantienen igual) */}
            <div className="group-settings-buttons" style={{marginTop: selectedChat.isGroup ? '0' : '10px'}}>
              
              <button 
                className="delete-btn" 
                style={{backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)'}}
                onClick={toggleDeleteMode}
              >
                🗑️ Borrar mensajes
              </button>

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
                letterSpacing: '1px',
                position: 'sticky',
                top: 0,
                zIndex: 5
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
                letterSpacing: '1px',
                position: 'sticky',
                top: 0,
                zIndex: 5
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

                {/* --- 1. ÁREA CLICABLE: FOTO + NOMBRE (SOLO EN CHATS PRIVADOS) --- */}
                <div 
                  style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      flex: 1,
                      // CAMBIO: Solo mostramos 'mano' si NO es grupo
                      cursor: selectedChat.isGroup ? 'default' : 'pointer' 
                  }}
                  onClick={() => {
                    // CAMBIO: Solo abrimos perfil si es chat privado
                    if (!selectedChat.isGroup) {
                        const userToView = getOtherParticipant(selectedChat.participants);
                        if (userToView) setViewingMember(userToView);
                    }
                  }}
                  title={selectedChat.isGroup ? '' : "Ver perfil"}
                >
                  <img 
                    src={selectedChat.isGroup 
                        ? (selectedChat.groupPictureUrl || DEFAULT_GROUP_PIC)
                        : (getOtherParticipant(selectedChat.participants)?.profilePictureUrl || DEFAULT_PROFILE_PIC)
                    }
                    alt="Avatar"
                    className="user-avatar-small" 
                    style={{ marginRight: '10px', width: '40px', height: '40px' }} 
                  />
                  
                  <h4 style={{ margin: 0 }}>
                    {selectedChat.isGroup 
                      ? selectedChat.groupName 
                      : getOtherParticipant(selectedChat.participants)?.username || 'Usuario'}
                  </h4>
                </div>
                
                {/* --- 2. BOTONES DE ACCIÓN (DERECHA) --- */}
                {isDeleteMode ? (
                    <div className="chat-header-options delete-mode-options">
                        <button 
                            className="confirm-delete-btn"
                            onClick={handleBulkDeleteClick}
                            disabled={selectedMsgIds.length === 0}
                            style={{backgroundColor: 'var(--accent-danger)', color: 'white', border: 'none'}}
                        >
                            🗑️ Eliminar ({selectedMsgIds.length})
                        </button>
                        <button 
                            onClick={cancelDeleteMode}
                            style={{marginLeft: '5px'}}
                        >
                            Cancelar
                        </button>
                    </div>
                ) : (
                    selectedChat.status === 'active' && (
                      <div className="chat-header-options">
                        <button 
                          className="group-settings-btn"
                          onClick={() => setShowGroupSettingsModal(true)}
                        >
                          {/* En grupos mostramos Ajustes, en privado también (pero con menú reducido) */}
                          Ajustes ⚙️
                        </button>
                      </div>
                    )
                )}
              </div>
              
              {selectedChat.status === 'active' ? (
                <>
                  <div className="message-list">
                    {/* --- INICIO DEL REEMPLAZO --- */}
<div className="message-list">
                  {messages.map((msg, index) => {
                    
                    // --- 1. LÓGICA DE SEPARADOR DE NO LEÍDOS ---
                    const firstUnreadIndex = messages.length - initialUnreadCount;
                    const showUnreadSeparator = initialUnreadCount > 0 && index === firstUnreadIndex;

                    // --- 2. LÓGICA DE FECHAS ---
                    const prevMsg = messages[index - 1];
                    const showDate = shouldShowDateSeparator(msg, prevMsg);

                    // --- 3. DETECTAR SI ESTÁ BORRADO ---
                    const isDeleted = msg.content && msg.content.includes('ha borrado') && msg.content.startsWith('**');
                    
                    // --- 4. RENDERIZAR MENSAJE DE SISTEMA ---
                    if (msg.type === 'system') {
                      return (
                        <React.Fragment key={msg._id}>
                           {showDate && (
                              <div className="date-separator">
                                <span>{formatDate(msg.createdAt)}</span>
                              </div>
                           )}
                           {/* Separador de no leídos en mensajes de sistema (raro pero posible) */}
                           {showUnreadSeparator && (
                                <div className="unread-separator" ref={unreadMarkerRef}>
                                    <span>Mensajes nuevos ⬇</span>
                                </div>
                            )}
                           <div className="system-message">
                             <span>{msg.content}</span>
                           </div>
                        </React.Fragment>
                      );
                    }

                    // --- 5. RENDERIZAR MENSAJE BORRADO (COMO SISTEMA) ---
                    if (isDeleted) {
                        return (
                            <React.Fragment key={msg._id}>
                                {showDate && (
                                    <div className="date-separator">
                                        <span>{formatDate(msg.createdAt)}</span>
                                    </div>
                                )}
                                {showUnreadSeparator && (
                                    <div className="unread-separator" ref={unreadMarkerRef}>
                                        <span>Mensajes nuevos ⬇</span>
                                    </div>
                                )}
                                <div className="system-message deleted-message">
                                    <span style={{ fontStyle: 'italic', color: 'var(--text-secondary)', backgroundColor: 'transparent', border: 'none' }}>
                                        🚫 {renderMessageContent(msg.content)}
                                    </span>
                                </div>
                            </React.Fragment>
                        );
                    }

                    // --- 6. RENDERIZAR MENSAJE NORMAL ---
                    const showAvatar = !prevMsg || prevMsg.type === 'system' || msg.sender._id !== prevMsg.sender._id || showDate || showUnreadSeparator;
                    const isSelected = selectedMsgIds.includes(msg._id);

                    return (
                      <React.Fragment key={msg._id}>
                        
                        {/* A. SEPARADOR DE FECHA */}
                        {showDate && (
                          <div className="date-separator">
                            <span>{formatDate(msg.createdAt)}</span>
                          </div>
                        )}

                        {/* B. SEPARADOR DE MENSAJES NUEVOS */}
                        {showUnreadSeparator && (
                            <div className="unread-separator" ref={unreadMarkerRef}>
                                <span>Mensajes nuevos ⬇</span>
                            </div>
                        )}

                        {/* C. BURBUJA DE MENSAJE */}
                        <div 
                            className={`message ${msg.sender._id === userId ? 'sent' : 'received'} ${isDeleteMode && isSelected ? 'msg-selected' : ''}`}
                            onClick={() => {
                                if (isDeleteMode && msg.sender._id === userId && msg.type !== 'system') {
                                    handleSelectMessage(msg._id);
                                }
                            }}
                            style={isDeleteMode && msg.sender._id === userId ? {cursor: 'pointer', opacity: isSelected ? 1 : 0.7} : {}}
                        >
                          {/* Checkbox modo borrado */}
                          {isDeleteMode && msg.sender._id === userId && (
                              <div className="msg-checkbox-wrapper">
                                  <input 
                                    type="checkbox" 
                                    checked={isSelected}
                                    readOnly
                                    style={{width: '18px', height: '18px', margin: '0 8px'}} 
                                  />
                              </div>
                          )}

                          {showAvatar && (
                            <img 
                              src={msg.sender.profilePictureUrl || DEFAULT_PROFILE_PIC}
                              alt={msg.sender.username}
                              className="message-avatar"
                            />
                          )}
                          
                          <div className={`message-content ${showAvatar ? '' : 'no-avatar'}`}>
                            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px'}}>
                                {showAvatar && <strong>{msg.sender.username}</strong>}
                            </div>
                            
                            {/* Multimedia y Documentos */}
                            {msg.mediaUrls && msg.mediaUrls.length > 0 && (
                                <div className="message-media-grid">
                                    {msg.mediaUrls.map((url, idx) => {
                                        // Detectar tipo por extensión
                                        const ext = url.split('.').pop().toLowerCase();
                                        const isVideo = ['mp4', 'webm', 'mov', 'mkv'].includes(ext) || msg.type === 'video';
                                        const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext);
                                        const isDoc = !isVideo && !isImage;

                                        if (isDoc) {
                                            // --- TARJETA DE DOCUMENTO CON ICONO REAL ---
                                            const rawName = decodeURIComponent(url.split('/').pop().split('?')[0]);
                                            const fileName = rawName.replace(/^\d+_/, '');
                                            
                                            // Obtenemos la URL del icono
                                            const iconUrl = getFileIconUrl(fileName);

                                            return (
                                                <div key={idx} className="document-card">
                                                    {/* IMAGEN DEL ICONO */}
                                                    <img 
                                                        src={iconUrl} 
                                                        alt="icon" 
                                                        className="doc-icon-img" 
                                                    />
                                                    
                                                    <div className="doc-info">
                                                        <span className="doc-name">{fileName}</span>
                                                        
                                                        <button 
                                                            className="doc-download-btn" 
                                                            onClick={(e) => {
                                                                e.stopPropagation(); 
                                                                handleDownloadFile(url, fileName); 
                                                            }}
                                                        >
                                                            ⬇ Descargar
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        }

                                        return isVideo ? (
                                            <video 
                                              key={idx} 
                                              src={url} 
                                              className="media-item video" 
                                              onClick={(e) => {
                                                  if (isDeleteMode) return;
                                                  e.stopPropagation();
                                                  handleExpandMedia(url, 'video', msg._id, msg.sender._id);
                                              }}
                                            />
                                        ) : (
                                            <img 
                                              key={idx} 
                                              src={url} 
                                              alt="Adjunto" 
                                              className="media-item image" 
                                              onClick={(e) => {
                                                  if (isDeleteMode) return;
                                                  e.stopPropagation();
                                                  handleExpandMedia(url, 'image', msg._id, msg.sender._id);
                                              }}
                                            />
                                        );
                                    })}
                                </div>
                            )}

                            {/* Texto */}
                            {msg.content && <p>{renderMessageContent(msg.content)}</p>}
                            
                            {/* Hora */}
                            <span className="msg-timestamp">
                              {formatTime(msg.createdAt)}
                            </span>
                          </div>
                        </div>
                      </React.Fragment>
                    )
                  })}
                  <div ref={messagesEndRef} />
                </div>
            {/* --- FIN DEL REEMPLAZO --- */}
                  </div>

                  {/* --- AREA DE VISTA PREVIA --- */}
                  {previews.length > 0 && (
                      <div className="file-preview-area">
                          {previews.map((file, idx) => (
                              <div key={idx} className="preview-item">
                                  {file.type === 'video' ? (
                                      <div className="video-icon-placeholder">▶ Video</div>
                                  ) : file.type === 'document' ? (
                                      <div className="video-icon-placeholder" style={{fontSize:'0.7rem', flexDirection:'column'}}>
                                          <span style={{fontSize:'1.5rem'}}>📄</span>
                                          <span style={{overflow:'hidden', textOverflow:'ellipsis', maxWidth:'90%', whiteSpace:'nowrap'}}>{file.name}</span>
                                      </div>
                                  ) : (
                                      <img src={file.url} alt="preview" />
                                  )}
                                  <button className="remove-preview" onClick={() => {
                                      const newFiles = [...selectedFiles];
                                      newFiles.splice(idx, 1);
                                      setSelectedFiles(newFiles);
                                      const newPreviews = [...previews];
                                      newPreviews.splice(idx, 1);
                                      setPreviews(newPreviews);
                                      if(newFiles.length === 0) {
                                          if(fileInputRef.current) fileInputRef.current.value = "";
                                          if(docInputRef.current) docInputRef.current.value = "";
                                      }
                                  }}>×</button>
                              </div>
                          ))}
                      </div>
                  )}

<div className="message-input-area">
                    {/* INPUTS OCULTOS (SIN CAMBIOS) */}
                    <input 
                        type="file" multiple accept="image/*,video/*"
                        ref={fileInputRef} style={{display: 'none'}}
                        onChange={(e) => handleFileSelect(e, false)}
                    />
                    <input 
                        type="file" multiple 
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar,.7z,.csv"
                        ref={docInputRef} style={{display: 'none'}}
                        onChange={(e) => handleFileSelect(e, true)}
                    />
                    
                    {/* BOTONES ADJUNTOS (SIN CAMBIOS) */}
                    <button 
                        className="attach-btn"
                        onClick={() => docInputRef.current.click()}
                        disabled={isChatBlocked || isSending}
                        title="Enviar documentos"
                    >
                        📎
                    </button>

                    <button 
                        className="camera-btn"
                        onClick={() => fileInputRef.current.click()}
                        disabled={isChatBlocked || isSending}
                        title="Enviar fotos o videos"
                    >
                        📷
                    </button>

                    <input 
                      type="text" 
                      placeholder={isChatBlocked ? "No puedes escribir..." : "Escribe un mensaje..."}
                      value={newMessage}
                      disabled={isChatBlocked || isSending}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                      style={isChatBlocked ? {backgroundColor: '#f0f0f0', cursor: 'not-allowed'} : {}}
                      // Para cerrar el picker si escriben texto
                      onFocus={() => setShowEmojiPicker(false)} 
                    />

                    {/* --- NUEVO: CONTENEDOR DE EMOJIS --- */}
                    <div className="emoji-wrapper">
                        <button 
                            className="emoji-btn"
                            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                            disabled={isChatBlocked || isSending}
                        >
                            😊
                        </button>
                        
                        {/* El panel de emojis se muestra si showEmojiPicker es true */}
                        {showEmojiPicker && (
                            <div className="emoji-picker-container">
                                <Picker 
                                    locale="es"
                                    i18n={i18n}
                                    onEmojiSelect={onEmojiClick}
                                    theme="auto"
                                    
                                    /* --- CAMBIOS AQUÍ --- */
                                    previewPosition="none"  /* Oculta la barra inferior de "Mood" */
                                    searchPosition="none"   /* <--- ESTO OCULTA LA BARRA DE BÚSQUEDA */
                                    skinTonePosition="none" /* (Opcional) Oculta selector de piel */
                                />
                            </div>
                        )}
                    </div>

                    <button onClick={handleSendMessage} disabled={isChatBlocked || isSending}>
                        {isSending ? '...' : 'Enviar'}
                    </button>
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