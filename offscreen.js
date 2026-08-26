// Listen for messages from background service worker
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'play_audio') {
    playAudioFile();
  }
});

function playAudioFile() {
  const audio = new Audio('alert.mp3'); 
  
  audio.play()
    .then(() => {
        console.log("Notification audio played successfully.");
    })
    .catch(err => {
        console.error("Audio playback error:", err);
    });
}