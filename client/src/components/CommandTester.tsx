import { useState } from "react";

interface CommandTesterProps {
  onSendCommand: (command: string) => void;
}

const CommandTester = ({ onSendCommand }: CommandTesterProps) => {
  const [command, setCommand] = useState("");

  const handleSendCommand = () => {
    if (command.trim()) {
      onSendCommand(command);
      setCommand("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && command.trim()) {
      handleSendCommand();
    }
  };

  return (
    <div className="p-4 border-t border-[#2C2F33]">
      <h3 className="text-sm font-bold mb-2">Test Command</h3>
      <div className="flex">
        <div className="relative flex-grow">
          <input
            type="text"
            placeholder="Type !claimed, !resol, hello, or ISO to test the bot..."
            className="w-full bg-[#40444b] text-white rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#5865F2]"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <div className="absolute mt-1 right-1 text-[10px] text-gray-400">
            Tip: Type "hello" to test welcome message, or "noimage" to test !claimed on non-image content
          </div>
        </div>
        <button
          className="ml-2 bg-[#5865F2] hover:bg-opacity-80 text-white px-4 py-2 rounded-md"
          onClick={handleSendCommand}
        >
          Send
        </button>
      </div>
    </div>
  );
};

export default CommandTester;
