import { makeAutoObservable, runInAction } from "mobx";
import React, { ChangeEvent } from 'react';
import { observer } from 'mobx-react-lite';

interface ChunkData {
  start: number;
  end: number;
  text: string;
  prediction: { [key: string]: number };
}

class AppStore {
  imageSrc: string | null = null;
  audioSrc: string | null = null;
  isRecording = false;
  isLoading = false;
  errorMessage: string | null = null;
  transcriptionData: ChunkData[] = [];
  synthesizedAudioSrc: string | null = null;
  selectedAccent = 'british';
  rawText = '';
  mediaRecorder: MediaRecorder | null = null;
  audioStream: MediaStream | null = null;
  audioChunks: Blob[] = [];
  chunkBeingRecorded: number | null = null;

  constructor() {
    makeAutoObservable(this);
  }

  async handleStartStopRecording() {
    if (this.isRecording) {
      this.handleStopRecording();
    } else {
      await this.handleStartRecording();
    }
  }

  async handleStartRecording() {
    try {
      this.setIsRecording(true);
      this.setImageSrc(null);
      this.setErrorMessage(null);
      this.setTranscriptionData([]);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      runInAction(() => {
        this.audioStream = stream;
      });
      const mediaRecorder = new MediaRecorder(stream);

      runInAction(() => {
        this.audioChunks = [];
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          runInAction(() => {
            this.audioChunks.push(event.data);
          });
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
        if (audioBlob.size === 0) {
          console.error('Recorded audio blob is empty.');
          return;
        }

        const audioURL = URL.createObjectURL(audioBlob);
        this.setAudioSrc(audioURL);

        const formData = new FormData();
        formData.append('file', audioBlob, 'audio.wav');

        this.setIsLoading(true);
        try {
          const response = await fetch('http://localhost:5000/predict', {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            throw new Error('Network response was not ok');
          }

          const data = await response.json();
          runInAction(() => {
            this.setImageSrc(`data:image/png;base64,${data.image_base64}`);
            this.setTranscriptionData(data.chunks);
            this.rawText = data.chunks.map((chunk: ChunkData) => chunk.text).join(' '); // Store raw text
          });
        } catch (error) {
          console.error('Error uploading audio:', error);
          this.setErrorMessage('Error uploading audio');
        } finally {
          this.setIsLoading(false);
          if (this.audioStream) {
            this.audioStream.getTracks().forEach(track => track.stop());
            this.audioStream = null;
          }
        }
      };

      runInAction(() => {
        this.mediaRecorder = mediaRecorder;
      });
      mediaRecorder.start();
    } catch (error) {
      console.error('Error starting recording:', error);
      this.setIsRecording(false);
    }
  }

  handleStopRecording() {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
      this.setIsRecording(false);
    }
  }

  async handleFileUpload(file: File) {
    if (file) {
      this.setImageSrc(null);
      this.setErrorMessage(null);
      this.setTranscriptionData([]);
      const audioURL = URL.createObjectURL(file);
      this.setAudioSrc(audioURL);

      const formData = new FormData();
      formData.append('file', file);

      this.setIsLoading(true);
      try {
        const response = await fetch('http://localhost:5000/predict', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          throw new Error('Network response was not ok');
        }

        const data = await response.json();
        runInAction(() => {
          this.setImageSrc(`data:image/png;base64,${data.image_base64}`);
          this.setTranscriptionData(data.chunks);
          this.rawText = data.chunks.map((chunk: ChunkData) => chunk.text).join(' ');
        });
      } catch (error) {
        console.error('Error uploading file:', error);
        this.setErrorMessage('Error uploading file');
      } finally {
        this.setIsLoading(false);
      }
    }
  }

  async handleSynthesize() {
    const text = this.rawText;
    const accent = this.selectedAccent;

    if (!text || !accent) {
      this.setErrorMessage('Text or accent is missing.');
      return;
    }

    this.setIsLoading(true);
    this.setErrorMessage(null);
    this.setSynthesizedAudioSrc(null);

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
      this.setSynthesizedAudioSrc(audioURL);
    } catch (error) {
      console.error('Error synthesizing audio:', error);
      this.setErrorMessage('Error synthesizing audio');
    } finally {
      this.setIsLoading(false);
    }
  }

  handlePlayChunk(start: number, end: number) {
    if (this.audioSrc) {
      const audio = new Audio(this.audioSrc);
      audio.currentTime = start;
      const handleTimeUpdate = () => {
        if (audio.currentTime >= end) {
          audio.pause();
          audio.removeEventListener('timeupdate', handleTimeUpdate);
        }
      };
      audio.addEventListener('timeupdate', handleTimeUpdate);
      audio.play();
    }
  }

  async handleStartChunkRecording(index: number) {
    if (this.isRecording) {
      return;
    }

    try {
      this.chunkBeingRecorded = index;
      this.setIsRecording(true);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      runInAction(() => {
        this.audioStream = stream;
      });
      const mediaRecorder = new MediaRecorder(stream);

      runInAction(() => {
        this.audioChunks = [];
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          runInAction(() => {
            this.audioChunks.push(event.data);
          });
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
        if (audioBlob.size === 0) {
          console.error('Recorded audio blob is empty.');
          return;
        }

        const formData = new FormData();
        formData.append('file', audioBlob, 'audio.wav');

        this.setIsLoading(true);
        try {
          const response = await fetch('http://localhost:5000/predict', {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            throw new Error('Network response was not ok');
          }

          const data = await response.json();
          runInAction(() => {
            const prevData = this.transcriptionData
            const replacedIndex = index;
            const newData = [...prevData];
            newData[replacedIndex] = data.chunks[0];
            this.setTranscriptionData(newData);
          });
        } catch (error) {
          console.error('Error uploading audio:', error);
          this.setErrorMessage('Error uploading audio');
        } finally {
          this.setIsLoading(false);
          if (this.audioStream) {
            this.audioStream.getTracks().forEach((track) => track.stop());
            this.audioStream = null;
          }
          this.chunkBeingRecorded = null;
          this.setIsRecording(false);
        }
      };

      runInAction(() => {
        this.mediaRecorder = mediaRecorder;
      });
      mediaRecorder.start();
    } catch (error) {
      console.error('Error starting chunk recording:', error);
      this.setIsRecording(false);
    }
  }

  // Utility setters to ensure state changes are tracked by MobX
  setIsRecording(value: boolean) {
    this.isRecording = value;
  }

  setIsLoading(value: boolean) {
    this.isLoading = value;
  }

  setImageSrc(value: string | null) {
    this.imageSrc = value;
  }

  setAudioSrc(value: string | null) {
    this.audioSrc = value;
  }

  setErrorMessage(value: string | null) {
    this.errorMessage = value;
  }

  setTranscriptionData(value: ChunkData[]) {
    this.transcriptionData = value;
  }

  setSynthesizedAudioSrc(value: string | null) {
    this.synthesizedAudioSrc = value;
  }
}

const appStore = new AppStore();

const App: React.FC = observer(() => {
  const handleFileUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      appStore.handleFileUpload(file);
    }
  };

  return (
      <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
        <header className="w-full max-w-md bg-white rounded-lg shadow-md p-6 text-center">
          <h1 className="text-2xl font-bold mb-4">Accent Recognition</h1>
          <div className="flex flex-col space-y-4">
            <div className="flex space-x-4">
              <button
                  onClick={() => appStore.handleStartStopRecording()}
                  className="bg-blue-500 text-white py-2 px-4 rounded disabled:opacity-50"
              >
                {appStore.isRecording ? 'Stop Recording' : 'Start Recording'}
              </button>
              <input
                  type="file"
                  accept="audio/*"
                  onChange={handleFileUpload}
                  className="file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
            </div>
            {appStore.audioSrc && (
                <audio controls src={appStore.audioSrc} className="w-full mt-4">
                  Your browser does not support the audio element.
                </audio>
            )}
            {appStore.isLoading ? (
                <p className="text-blue-500">Loading...</p>
            ) : (
                <>
                  {appStore.imageSrc && <img src={appStore.imageSrc} alt="Accent Result" className="mt-4 w-full object-contain" />}
                  {appStore.errorMessage && <p className="text-red-500">{appStore.errorMessage}</p>}
                  {appStore.transcriptionData.length > 0 && (
                      <div className="w-full mt-4">
                        <table className="w-full border-collapse">
                          <thead>
                          <tr>
                            <th className="border p-2 text-left">Text</th>
                            <th className="border p-2 text-left">Predictions</th>
                            <th className="border p-2 text-left">Actions</th>
                          </tr>
                          </thead>
                          <tbody>
                          {appStore.transcriptionData.map((chunk, index) => (
                              <tr key={index}>
                                <td className="border p-2">
                            <textarea
                                readOnly
                                className="w-full p-2 border border-gray-300 rounded"
                                value={chunk.text}
                            />
                                </td>
                                <td className="border p-2">
                                  {Object.entries(chunk.prediction)
                                      .map(([accent, prob]) => `${accent}: ${(prob * 100).toFixed(2)}%`)
                                      .join(', ')}
                                </td>
                                <td className="border p-2 flex space-x-2">
                                  <button
                                      onClick={() => appStore.handlePlayChunk(chunk.start, chunk.end)}
                                      className="bg-blue-500 text-white py-1 px-2 rounded"
                                  >
                                    Play
                                  </button>
                                  <button
                                      onClick={() => appStore.handleStartChunkRecording(index)}
                                      className="bg-red-500 text-white py-1 px-2 rounded"
                                      disabled={appStore.isRecording}
                                  >
                                    Re-record
                                  </button>
                                </td>
                              </tr>
                          ))}
                          </tbody>
                        </table>
                      </div>
                  )}
                  <div className="flex items-center space-x-4 mt-4">
                    <select
                        value={appStore.selectedAccent}
                        onChange={(e) => appStore.selectedAccent = e.target.value}
                        className="border border-gray-300 rounded p-2"
                    >
                      <option value="british">British</option>
                      <option value="us">US</option>
                    </select>
                    <button
                        onClick={() => appStore.handleSynthesize()}
                        className="bg-green-500 text-white py-2 px-4 rounded"
                    >
                      Synthesize
                    </button>
                  </div>
                  {appStore.synthesizedAudioSrc && (
                      <audio controls src={appStore.synthesizedAudioSrc} className="w-full mt-4">
                        Your browser does not support the audio element.
                      </audio>
                  )}
                </>
            )}
          </div>
        </header>
      </div>
  );
});

export default App;
