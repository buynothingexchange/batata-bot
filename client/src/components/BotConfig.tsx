import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";

interface BotConfigProps {
  config: {
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
    processUptime?: string;
    memory: {
      used: string;
      total: string;
    };
    commandsProcessed: number;
    healthStatus?: {
      healthCheckFailures: number;
      reconnectAttempts: number;
    };
  } | undefined;
  isStatusLoading: boolean;
  onRestartBot: () => void;
}

const BotConfig = ({ 
  config, 
  isLoading, 
  botStatus, 
  isStatusLoading,
  onRestartBot 
}: BotConfigProps) => {
  
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
        
        {/* Features Skeleton */}
        <div className="mb-6">
          <h4 className="text-sm uppercase text-[#B9BBBE] font-bold mb-2">Bot Features</h4>
          <div className="bg-[#36393f] rounded-md p-3">
            <Skeleton className="h-4 w-full mb-1" />
            <Skeleton className="h-4 w-full mb-1" />
            <Skeleton className="h-4 w-full mb-1" />
            <Skeleton className="h-4 w-full mb-1" />
            <Skeleton className="h-4 w-full mb-1" />
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
              <span>Connection uptime:</span>
              <span>{botStatus?.uptime || '0 minutes'}</span>
            </div>
            {botStatus?.processUptime && (
              <div className="flex justify-between mt-1">
                <span>Process uptime:</span>
                <span>{botStatus.processUptime}</span>
              </div>
            )}
            <div className="flex justify-between mt-1">
              <span>Memory:</span>
              <span>{botStatus?.memory?.used || '0MB'} / {botStatus?.memory?.total || '0MB'}</span>
            </div>
            <div className="flex justify-between mt-1">
              <span>Commands processed:</span>
              <span>{botStatus?.commandsProcessed || 0}</span>
            </div>
            
            {/* Health monitoring information */}
            {botStatus?.healthStatus && (
              <>
                <div className="h-px bg-[#4F545C40] my-2"></div>
                <div className="text-xs font-semibold uppercase text-[#B9BBBE] mt-2 mb-1">Health Monitoring</div>
                
                <div className="flex justify-between text-xs mt-1">
                  <span>Health check failures:</span>
                  <span className={botStatus.healthStatus.healthCheckFailures > 0 ? 'text-[#FEE75C]' : 'text-[#57F287]'}>
                    {botStatus.healthStatus.healthCheckFailures}
                  </span>
                </div>
                
                <div className="flex justify-between text-xs mt-1">
                  <span>Reconnect attempts:</span>
                  <span className={botStatus.healthStatus.reconnectAttempts > 0 ? 'text-[#FEE75C]' : 'text-[#57F287]'}>
                    {botStatus.healthStatus.reconnectAttempts}
                  </span>
                </div>
                
                <div className="mt-2 text-xs">
                  <div className={`px-2 py-1 rounded ${botStatus.healthStatus.healthCheckFailures === 0 && botStatus.healthStatus.reconnectAttempts === 0 ? 'bg-[#57F28720]' : 'bg-[#FEE75C20]'}`}>
                    <div className="flex items-start">
                      <div className={`flex-shrink-0 w-2 h-2 rounded-full mt-1 mr-1.5 ${botStatus.healthStatus.healthCheckFailures === 0 && botStatus.healthStatus.reconnectAttempts === 0 ? 'bg-[#57F287]' : 'bg-[#FEE75C]'}`}></div>
                      <span>
                        {botStatus.healthStatus.healthCheckFailures === 0 && botStatus.healthStatus.reconnectAttempts === 0 
                          ? 'System healthy with persistent database connection' 
                          : 'System recovered from temporary connectivity issues'}
                      </span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      
      {/* Command Information */}
      <div className="mb-6">
        <h4 className="text-sm uppercase text-[#B9BBBE] font-bold mb-2">Bot Features</h4>
        <div className="bg-[#36393f] rounded-md p-3">
          <div className="mb-3">
            <div className="text-sm text-[#B9BBBE] mb-3">
              <p className="mb-2">Batata now focuses exclusively on:</p>
              <ul className="list-disc pl-5 space-y-2">
                <li>Processing "ISO" (In Search Of) requests</li>
                <li>Formatting requests in standardized templates</li>
                <li>Forwarding formatted messages to category channels</li>
                <li>Providing an interactive "Fulfilled" button</li>
                <li>Archiving fulfilled item requests</li>
              </ul>
              <p className="mt-3 text-xs text-[#B9BBBE]">The !claimed and !resol commands have been removed to streamline functionality.</p>
            </div>
          </div>
        </div>
      </div>
      
      {/* Permissions */}
      <div className="mb-6">
        <h4 className="text-sm uppercase text-[#B9BBBE] font-bold mb-2">Required Permissions</h4>
        <div className="bg-[#36393f] rounded-md p-3">
          <p className="text-sm text-[#B9BBBE] mb-3">
            The bot needs these permissions to function properly. If you're experiencing errors, 
            please check that Batata has these permissions in your Discord server.
          </p>

          <div className="flex items-center justify-between mb-2">
            <label className="text-sm flex items-center">
              <span>Read Messages</span>
            </label>
            <Switch checked={true} id="read-messages" disabled />
          </div>

          <div className="flex items-center justify-between mb-2">
            <label className="text-sm flex items-center">
              <span>Send Messages</span>
            </label>
            <Switch checked={true} id="send-messages" disabled />
          </div>
          
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm flex items-center">
              <span>Add Reactions</span>
            </label>
            <Switch checked={config.permissions.addReactions} id="add-reactions" disabled />
          </div>
          
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm flex items-center">
              <span>Read Message History</span>
            </label>
            <Switch checked={config.permissions.readMessageHistory} id="read-history" disabled />
          </div>
          
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm flex items-center">
              <span>Embed Links</span>
            </label>
            <Switch checked={true} id="embed-links" disabled />
          </div>
          
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm flex items-center">
              <span>Manage Messages</span>
            </label>
            <Switch checked={config.permissions.manageMessages} id="manage-messages" disabled />
          </div>

          <div className="mt-2 px-2 py-1 bg-[#4F545C40] rounded text-sm text-[#B9BBBE]">
            <p className="flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-[#FEE75C]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              If you see "Missing Permissions" errors, update these in your Discord server settings.
            </p>
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
