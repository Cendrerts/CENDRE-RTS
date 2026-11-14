export function handleAbandonChoice(choice, leaveRoom) {
  if (choice === 'abandon') {
    leaveRoom();
  }
}
