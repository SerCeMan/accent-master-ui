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
  const [synthesizedAudioSrc, setSynthesizedAudioSrc] = useState<string | null>(null);
  const [selectedAccent, setSelectedAccent] = useState<string>('british');
  const rawTextRef = useRef<string>('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const handleStartStopRecording = async () => {
    if (isRecording) {
      handleStopRecording();
    } else {
      await handleStartRecording();
    }
  };

  const handleStartRecording = async () => {
    try {
      setIsRecording(true);
      setImageSrc(null);
      setErrorMessage(null);
      setTranscriptionData([]);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream);

      audioChunksRef.current = [];

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
        setAudioSrc(audioURL);

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
          setImageSrc(`data:image/png;base64,${data.image_base64}`);
          setTranscriptionData(data.chunks);
          rawTextRef.current = data.chunks.map((chunk: ChunkData) => chunk.text).join(' '); // Store raw text
        } catch (error) {
          console.error('Error uploading audio:', error);
          setErrorMessage('Error uploading audio');
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
      setImageSrc(null);
      setErrorMessage(null);
      setTranscriptionData([]);
      const audioURL = URL.createObjectURL(file);
      setAudioSrc(audioURL);

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
        setImageSrc(`data:image/png;base64,${data.image_base64}`);
        setTranscriptionData(data.chunks);
        rawTextRef.current = data.chunks.map((chunk: ChunkData) => chunk.text).join(' ');
      } catch (error) {
        console.error('Error uploading file:', error);
        setErrorMessage('Error uploading file');
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleSynthesize = async () => {
    const text = rawTextRef.current;
    const accent = selectedAccent;

    if (!text || !accent) {
      setErrorMessage('Text or accent is missing.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setSynthesizedAudioSrc(null);

    try {
      const response = await fetch('http://localhost:5001/synthesize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text, accent }),
      });

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      const audioBlob = await response.blob();
      const audioURL = URL.createObjectURL(audioBlob);
      setSynthesizedAudioSrc(audioURL);
    } catch (error) {
      console.error('Error synthesizing audio:', error);
      setErrorMessage('Error synthesizing audio');
    } finally {
      setIsLoading(false);
    }
  };

  return (
      <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
        <header className="w-full max-w-md bg-white rounded-lg shadow-md p-6 text-center">
          <h1 className="text-2xl font-bold mb-4">Accent Recognition</h1>
          <div className="flex flex-col space-y-4">
            <div className="flex space-x-4">
              <button
                  onClick={handleStartStopRecording}
                  className="bg-blue-500 text-white py-2 px-4 rounded disabled:opacity-50"
              >
                {isRecording ? 'Stop Recording' : 'Start Recording'}
              </button>
              <input
                  type="file"
                  accept="audio/*"
                  onChange={handleFileUpload}
                  className="file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
            </div>
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
                      <div className="w-full mt-4">
                        <table className="w-full border-collapse">
                          <thead>
                          <tr>
                            <th className="border p-2 text-left">Text</th>
                            <th className="border p-2 text-left">Predictions</th>
                          </tr>
                          </thead>
                          <tbody>
                          {transcriptionData.map((chunk, index) => (
                              <tr key={index}>
                                <td className="border p-2">
                            <textarea
                                className="w-full p-2 border border-gray-300 rounded fitcnt"
                                value={chunk.text}
                            />
                                </td>
                                <td className="border p-2">
                                  {}
                                  {Object.entries(chunk.prediction)
                                      .map(([accent, prob]) => {
                                        return <p>{`${accent}: ${(prob * 100).toFixed(2)}%`}</p>;
                                      })}
                                </td>
                              </tr>
                          ))}
                          </tbody>
                        </table>
                      </div>
                  )}
                  <div className="flex items-center space-x-4 mt-4">
                    <select
                        value={selectedAccent}
                        onChange={(e) => setSelectedAccent(e.target.value)}
                        className="border border-gray-300 rounded p-2"
                    >
                      <option value="british">British</option>
                      <option value="us">US</option>
                    </select>
                    <button
                        onClick={handleSynthesize}
                        className="bg-green-500 text-white py-2 px-4 rounded"
                    >
                      Synthesize
                    </button>
                  </div>
                  {synthesizedAudioSrc && (
                      <audio controls src={synthesizedAudioSrc} className="w-full mt-4">
                        Your browser does not support the audio element.
                      </audio>
                  )}
                </>
            )}
          </div>
        </header>
      </div>
  );
};

export default App;
