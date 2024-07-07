import React, { useState, useRef } from 'react';

interface ChunkData {
  start: number;
  end: number;
  text: string;
  prediction: { [key: string]: number };
}

const App: React.FC = () => {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [transcriptionData, setTranscriptionData] = useState<ChunkData[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const handleStartRecording = async () => {
    try {
      setIsRecording(true);
      setImageSrc(null);  // Clear the image
      setErrorMessage(null);  // Clear any previous error message
      setTranscriptionData([]);  // Clear previous transcription data
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream);

      audioChunksRef.current = []; // Reset audio chunks

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        if (audioBlob.size === 0) {
          console.error('Recorded audio blob is empty.');
          return;
        }

        const audioURL = URL.createObjectURL(audioBlob);
        setAudioSrc(audioURL); // Set the audio source for playback

        const formData = new FormData();
        formData.append('file', audioBlob, 'audio.wav');

        setIsLoading(true);
        try {
          const response = await fetch('http://localhost:5000/predict', {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            throw new Error('Network response was not ok');
          }

          const data = await response.json();
          setImageSrc(`data:image/png;base64,${data.image_base64}`); // Use base64 image
          setTranscriptionData(data.chunks); // Set transcription data with predictions
        } catch (error) {
          console.error('Error uploading audio:', error);
          setErrorMessage('Error uploading audio'); // Set error message
        } finally {
          setIsLoading(false);
          if (audioStreamRef.current) {
            audioStreamRef.current.getTracks().forEach(track => track.stop());
            audioStreamRef.current = null;
          }
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
    } catch (error) {
      console.error('Error starting recording:', error);
      setIsRecording(false);
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setImageSrc(null);  // Clear the image
      setErrorMessage(null);  // Clear any previous error message
      setTranscriptionData([]);  // Clear previous transcription data
      const audioURL = URL.createObjectURL(file);
      setAudioSrc(audioURL); // Set the audio source for playback

      const formData = new FormData();
      formData.append('file', file);

      setIsLoading(true);
      try {
        const response = await fetch('http://localhost:5000/predict', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          throw new Error('Network response was not ok');
        }

        const data = await response.json();
        setImageSrc(`data:image/png;base64,${data.image_base64}`); // Use base64 image
        setTranscriptionData(data.chunks); // Set transcription data with predictions
      } catch (error) {
        console.error('Error uploading file:', error);
        setErrorMessage('Error uploading file'); // Set error message
      } finally {
        setIsLoading(false);
      }
    }
  };

  return (
      <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
        <header className="w-full max-w-md bg-white rounded-lg shadow-md p-6 text-center">
          <h1 className="text-2xl font-bold mb-4">Accent Recognition</h1>
          <div className="flex flex-col space-y-4">
            <button
                onClick={handleStartRecording}
                disabled={isRecording}
                className="bg-blue-500 text-white py-2 px-4 rounded disabled:opacity-50"
            >
              Start Recording
            </button>
            <button
                onClick={handleStopRecording}
                disabled={!isRecording}
                className="bg-red-500 text-white py-2 px-4 rounded disabled:opacity-50"
            >
              Stop Recording
            </button>
            <input
                type="file"
                accept="audio/*"
                onChange={handleFileUpload}
                className="file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            {audioSrc && (
                <audio controls src={audioSrc} className="w-full mt-4">
                  Your browser does not support the audio element.
                </audio>
            )}
            {isLoading ? (
                <p className="text-blue-500">Loading...</p>
            ) : (
                <>
                  {imageSrc && <img src={imageSrc} alt="Accent Result" className="mt-4 w-full object-contain" />}
                  {errorMessage && <p className="text-red-500">{errorMessage}</p>}
                  {transcriptionData.length > 0 && (
                      <textarea
                          readOnly
                          className="w-full mt-4 p-2 border border-gray-300 rounded"
                          rows={transcriptionData.length}
                          value={transcriptionData.map(chunk => {
                            const predictions = Object.entries(chunk.prediction)
                                .map(([accent, prob]) => `${accent}: ${(prob * 100).toFixed(2)}%`)
                                .join(', ');
                            return `${chunk.text} (${predictions})`;
                          }).join('\n')}
                      />
                  )}
                </>
            )}
          </div>
        </header>
      </div>
  );
};

export default App;
