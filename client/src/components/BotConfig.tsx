import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";

interface BotConfigProps {
  config: {
    commandTrigger: string;
    reactionEmoji: string;
    permissions: {
      manageMessages: boolean;
      addReactions: boolean;
      readMessageHistory: boolean;
    };
    allowedChannels: {
      name: string;
      enabled: boolean;
    }[];
  } | undefined;
  isLoading: boolean;
  botStatus: {
    status: string;
    uptime: string;
    memory: {
      used: string;
      total: string;
    };
    commandsProcessed: number;
  } | undefined;
  isStatusLoading: boolean;
  onUpdateConfig: (config: { commandTrigger: string; reactionEmoji: string }) => void;
  onRestartBot: () => void;
}

const COMMON_EMOJIS = ["✅", "⭐", "🎨", "🖌️", "👏", "❤️", "👍", "🔥", "😀", "😂"];

const BotConfig = ({ 
  config, 
  isLoading, 
  botStatus, 
  isStatusLoading,
  onUpdateConfig, 
  onRestartBot 
}: BotConfigProps) => {
  const [commandTrigger, setCommandTrigger] = useState(config?.commandTrigger || "!claimed");
  const [reactionEmoji, setReactionEmoji] = useState(config?.reactionEmoji || "✅");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  
  const handleSaveChanges = () => {
    onUpdateConfig({
      commandTrigger,
      reactionEmoji
    });
  };
  
  if (isLoading || isStatusLoading) {
    return (
      <div className="md:w-80 bg-[#2f3136] p-4 overflow-y-auto scrollbar-custom border-t md:border-t-0 md:border-l border-[#2C2F33]">
        <h3 className="text-lg font-bold mb-4 flex items-center">
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            className="h-5 w-5 mr-2 text-[#5865F2]" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round"
          >
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
          </svg>
          Bot Configuration
        </h3>
        
        {/* Bot Status Skeleton */}
        <div className="mb-6">
          <h4 className="text-sm uppercase text-[#B9BBBE] font-bold mb-2">Bot Status</h4>
          <div className="bg-[#36393f] rounded-md p-3">
            <div className="flex justify-between items-center">
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-8 w-16" />
            </div>
            <div className="mt-2">
              <Skeleton className="h-4 w-full mb-1" />
              <Skeleton className="h-4 w-full mb-1" />
              <Skeleton className="h-4 w-full" />
            </div>
          </div>
        </div>
        
        {/* Reaction Configuration Skeleton */}
        <div className="mb-6">
          <h4 className="text-sm uppercase text-[#B9BBBE] font-bold mb-2">Reaction Settings</h4>
          <div className="bg-[#36393f] rounded-md p-3">
            <Skeleton className="h-4 w-32 mb-1" />
            <Skeleton className="h-10 w-full mb-3" />
            <Skeleton className="h-4 w-32 mb-1" />
            <Skeleton className="h-10 w-full mb-3" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
      </div>
    );
  }
  
  if (!config) {
    return (
      <div className="md:w-80 bg-[#2f3136] p-4 overflow-y-auto scrollbar-custom border-t md:border-t-0 md:border-l border-[#2C2F33]">
        <div className="text-center p-4">
          <p className="text-[#B9BBBE]">Failed to load configuration.</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="md:w-80 bg-[#2f3136] p-4 overflow-y-auto scrollbar-custom border-t md:border-t-0 md:border-l border-[#2C2F33]">
      <h3 className="text-lg font-bold mb-4 flex items-center">
        <svg 
          xmlns="http://www.w3.org/2000/svg" 
          className="h-5 w-5 mr-2 text-[#5865F2]" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="2" 
          strokeLinecap="round" 
          strokeLinejoin="round"
        >
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
        </svg>
        Bot Configuration
      </h3>
      
      {/* Bot Status */}
      <div className="mb-6">
        <h4 className="text-sm uppercase text-[#B9BBBE] font-bold mb-2">Bot Status</h4>
        <div className="bg-[#36393f] rounded-md p-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center">
              <div className={`w-3 h-3 rounded-full ${botStatus?.status === 'online' ? 'bg-[#57F287]' : 'bg-[#ED4245]'} mr-2`}></div>
              <span>{botStatus?.status === 'online' ? 'Online' : 'Offline'}</span>
            </div>
            <button 
              className="text-sm px-2 py-1 bg-[#2C2F33] hover:bg-[#4F545C] rounded-md transition"
              onClick={onRestartBot}
            >
              Restart
            </button>
          </div>
          <div className="mt-2 text-sm text-[#B9BBBE]">
            <div className="flex justify-between">
              <span>Uptime:</span>
              <span>{botStatus?.uptime || '0 minutes'}</span>
            </div>
            <div className="flex justify-between mt-1">
              <span>Memory:</span>
              <span>{botStatus?.memory?.used || '0MB'} / {botStatus?.memory?.total || '0MB'}</span>
            </div>
            <div className="flex justify-between mt-1">
              <span>Commands processed:</span>
              <span>{botStatus?.commandsProcessed || 0}</span>
            </div>
          </div>
        </div>
      </div>
      
      {/* Reaction Configuration */}
      <div className="mb-6">
        <h4 className="text-sm uppercase text-[#B9BBBE] font-bold mb-2">Reaction Settings</h4>
        <div className="bg-[#36393f] rounded-md p-3">
          <div className="mb-3">
            <label className="block text-sm mb-1">Command Trigger</label>
            <div className="relative">
              <input 
                type="text" 
                value={commandTrigger} 
                onChange={(e) => setCommandTrigger(e.target.value)}
                className="w-full bg-[#2C2F33] text-white px-3 py-2 rounded-md focus:outline-none focus:ring-1 focus:ring-[#5865F2]" 
              />
            </div>
          </div>
          
          <div className="mb-1">
            <label className="block text-sm mb-1">Reaction Emoji</label>
            <div className="flex items-center">
              <div className="relative flex-grow">
                <input 
                  type="text" 
                  value={reactionEmoji} 
                  onChange={(e) => setReactionEmoji(e.target.value)}
                  className="w-full bg-[#2C2F33] text-white px-3 py-2 rounded-md focus:outline-none focus:ring-1 focus:ring-[#5865F2]" 
                />
                <button 
                  className="absolute right-2 top-2 text-[#B9BBBE]"
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                >
                  <svg 
                    xmlns="http://www.w3.org/2000/svg" 
                    className="h-5 w-5" 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    stroke="currentColor" 
                    strokeWidth="2" 
                    strokeLinecap="round" 
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
                    <line x1="9" y1="9" x2="9.01" y2="9"/>
                    <line x1="15" y1="9" x2="15.01" y2="9"/>
                  </svg>
                </button>
                {showEmojiPicker && (
                  <div className="absolute right-0 top-10 bg-[#2C2F33] p-2 rounded-md shadow-lg z-10 w-48">
                    <div className="grid grid-cols-5 gap-1">
                      {COMMON_EMOJIS.map((emoji) => (
                        <button 
                          key={emoji}
                          className="hover:bg-[#4F545C] p-1 rounded"
                          onClick={() => {
                            setReactionEmoji(emoji);
                            setShowEmojiPicker(false);
                          }}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          <div className="mt-3">
            <button 
              className="w-full bg-[#5865F2] hover:bg-opacity-80 text-white py-2 rounded-md transition"
              onClick={handleSaveChanges}
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
      
      {/* Permissions */}
      <div className="mb-6">
        <h4 className="text-sm uppercase text-[#B9BBBE] font-bold mb-2">Permissions</h4>
        <div className="bg-[#36393f] rounded-md p-3">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm flex items-center">
              <span>Manage Messages</span>
            </label>
            <Switch checked={config.permissions.manageMessages} id="manage-messages" disabled />
          </div>
          
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm flex items-center">
              <span>Add Reactions</span>
            </label>
            <Switch checked={config.permissions.addReactions} id="add-reactions" disabled />
          </div>
          
          <div className="flex items-center justify-between">
            <label className="text-sm flex items-center">
              <span>Read Message History</span>
            </label>
            <Switch checked={config.permissions.readMessageHistory} id="read-history" disabled />
          </div>
        </div>
      </div>
      
      {/* Allowed Channels */}
      <div>
        <h4 className="text-sm uppercase text-[#B9BBBE] font-bold mb-2">Allowed Channels</h4>
        <div className="bg-[#36393f] rounded-md p-3">
          {config.allowedChannels.map((channel) => (
            <div key={channel.name} className="flex items-center justify-between mb-2">
              <label className="text-sm flex items-center">
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  className="h-4 w-4 mr-1 text-[#B9BBBE]" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth="2" 
                  strokeLinecap="round" 
                  strokeLinejoin="round"
                >
                  <path d="M7 20l4-16m2 16l4-16"/>
                </svg>
                <span>{channel.name}</span>
              </label>
              <Switch checked={channel.enabled} id={`channel-${channel.name}`} disabled />
            </div>
          ))}
          
          <button className="mt-3 text-[#5865F2] hover:underline text-sm flex items-center">
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              className="h-4 w-4 mr-1" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round"
            >
              <path d="M5 12h14"/>
              <path d="M12 5v14"/>
            </svg>
            Add Channel
          </button>
        </div>
      </div>
    </div>
  );
};

export default BotConfig;
