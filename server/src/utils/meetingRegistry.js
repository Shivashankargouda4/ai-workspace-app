// In-memory registry of active WebRTC meeting room participants keyed by meetingId -> Map<socketId, peerState>
const rooms = new Map();

function getRoom(meetingId) {
  const id = Number(meetingId);
  if (!rooms.has(id)) {
    rooms.set(id, new Map());
  }
  return rooms.get(id);
}

function addParticipant(meetingId, socketId, info) {
  const room = getRoom(meetingId);
  room.set(socketId, { socketId, ...info });
  return Array.from(room.values());
}

function updateParticipant(meetingId, socketId, patch) {
  const room = rooms.get(Number(meetingId));
  if (!room || !room.has(socketId)) return null;
  const updated = { ...room.get(socketId), ...patch };
  room.set(socketId, updated);
  return updated;
}

function removeParticipant(meetingId, socketId) {
  const id = Number(meetingId);
  const room = rooms.get(id);
  if (!room) return null;
  const removed = room.get(socketId) || null;
  room.delete(socketId);
  if (room.size === 0) {
    rooms.delete(id);
  }
  return removed;
}

function removeSocketFromAllRooms(socketId) {
  const left = [];
  for (const [meetingId, room] of rooms.entries()) {
    if (room.has(socketId)) {
      const peer = room.get(socketId);
      room.delete(socketId);
      left.push({ meetingId, peer });
      if (room.size === 0) {
        rooms.delete(meetingId);
      }
    }
  }
  return left;
}

function getMeetingPeers(meetingId) {
  const room = rooms.get(Number(meetingId));
  return room ? Array.from(room.values()) : [];
}

function getMeetingParticipantCount(meetingId) {
  const room = rooms.get(Number(meetingId));
  return room ? room.size : 0;
}

function isSocketInMeeting(meetingId, socketId) {
  const room = rooms.get(Number(meetingId));
  return Boolean(room && room.has(socketId));
}

function clearMeetingRoom(meetingId) {
  rooms.delete(Number(meetingId));
}

module.exports = {
  addParticipant,
  updateParticipant,
  removeParticipant,
  removeSocketFromAllRooms,
  getMeetingPeers,
  getMeetingParticipantCount,
  isSocketInMeeting,
  clearMeetingRoom,
};
