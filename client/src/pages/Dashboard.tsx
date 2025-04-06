import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import Sidebar from "@/components/Sidebar";
import ChannelSidebar from "@/components/ChannelSidebar";
import ActivityLog from "@/components/ActivityLog";
import BotConfig from "@/components/BotConfig";
import CommandTester from "@/components/CommandTester";
import { Log } from "@shared/schema";

const Dashboard = () => {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const { toast } = useToast();

  // Fetch bot status
  const { data: botStatus, isLoading: isStatusLoading } = useQuery({
    queryKey: ["/api/bot/status"],
  });

  // Fetch logs
  const {
    data: logs,
    isLoading: isLogsLoading,
    refetch: refetchLogs,
  } = useQuery<Log[]>({
    queryKey: ["/api/logs"],
  });

  // Fetch config
  const { data: config, isLoading: isConfigLoading } = useQuery({
    queryKey: ["/api/bot/config"],
  });

  // Update config mutation
  const updateConfig = useMutation({
    mutationFn: async (newConfig: { commandTrigger: string; reactionEmoji: string }) => {
      return apiRequest("POST", "/api/bot/config", newConfig);
    },
    onSuccess: () => {
      toast({
        title: "Configuration updated",
        description: "Your bot configuration has been updated successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Test command mutation
  const testCommand = useMutation({
    mutationFn: async (command: string) => {
      return apiRequest("POST", "/api/bot/test-command", { command });
    },
    onSuccess: () => {
      toast({
        title: "Command sent",
        description: "Test command has been processed.",
      });
      refetchLogs();
    },
    onError: (error) => {
      toast({
        title: "Command failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Restart bot mutation
  const restartBot = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/bot/restart", {});
    },
    onSuccess: () => {
      toast({
        title: "Bot restarted",
        description: "Your bot has been restarted successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Restart failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <div className="flex h-screen bg-[#36393F] text-white overflow-hidden">
      <Sidebar />
      
      <ChannelSidebar 
        isOpen={isMobileSidebarOpen} 
        onClose={() => setIsMobileSidebarOpen(false)}
      />
      
      <div className="flex-grow flex flex-col h-full">
        {/* Channel Header */}
        <div className="h-12 border-b border-[#2C2F33] flex items-center px-4">
          <div className="flex items-center">
            <button 
              className="md:hidden mr-2 text-[#B9BBBE]"
              onClick={() => setIsMobileSidebarOpen(true)}
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
                <path d="M4 6h16M4 12h16M4 18h16"/>
              </svg>
            </button>
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              className="h-4 w-4 text-[#B9BBBE] mr-2" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round"
            >
              <path d="M7 20l4-16m2 16l4-16"/>
            </svg>
            <h2 className="font-bold">bot-logs</h2>
          </div>
          
          <div className="ml-auto flex items-center space-x-4">
            <button className="text-[#B9BBBE] hover:text-white">
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
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
            </button>
            <button className="text-[#B9BBBE] hover:text-white">
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
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </button>
            <div className="relative">
              <input 
                type="text" 
                placeholder="Search" 
                className="bg-[#2C2F33] text-[#B9BBBE] px-2 py-1 rounded text-sm w-40 focus:outline-none focus:ring-1 focus:ring-[#5865F2]"
              />
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                className="h-4 w-4 absolute right-2 top-1.5 text-[#B9BBBE]" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8"/>
                <path d="m21 21-4.3-4.3"/>
              </svg>
            </div>
          </div>
        </div>
        
        {/* Main Dashboard Area */}
        <div className="flex-grow flex flex-col md:flex-row overflow-hidden">
          {/* Bot Activity Log */}
          <ActivityLog logs={logs || []} isLoading={isLogsLoading} />
          
          {/* Bot Configuration Panel */}
          <BotConfig 
            config={config}
            isLoading={isConfigLoading}
            onUpdateConfig={(newConfig) => updateConfig.mutate(newConfig)}
            onRestartBot={() => restartBot.mutate()}
            botStatus={botStatus}
            isStatusLoading={isStatusLoading}
          />
        </div>
        
        {/* Command Input */}
        <CommandTester onSendCommand={(command) => testCommand.mutate(command)} />
      </div>
    </div>
  );
};

export default Dashboard;
