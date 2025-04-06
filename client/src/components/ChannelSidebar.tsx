interface ChannelSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const ChannelSidebar = ({ isOpen, onClose }: ChannelSidebarProps) => {
  return (
    <div className={`w-60 bg-[#2f3136] h-full flex flex-col absolute z-10 md:relative md:block ${isOpen ? 'block' : 'hidden md:block'}`}>
      <div className="p-4 border-b border-[#2C2F33]">
        <h2 className="font-bold text-xl">ClaimBot</h2>
        <div className="flex items-center mt-2">
          <div className="w-3 h-3 rounded-full bg-[#57F287] mr-2"></div>
          <span className="text-sm text-[#B9BBBE]">Online</span>
        </div>
      </div>
      
      {/* Channels Section */}
      <div className="p-2 flex-grow overflow-y-auto scrollbar-custom">
        {/* Bot Commands Section */}
        <div className="mt-2 mb-4">
          <div className="flex items-center px-1 text-[#B9BBBE] uppercase text-xs font-semibold mb-1">
            <span>Bot Commands</span>
          </div>
          
          <div className="text-[#B9BBBE] hover:text-white hover:bg-[#4F545C] rounded px-2 py-1 cursor-pointer transition">
            <div className="flex items-center">
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
              <span>commands</span>
            </div>
          </div>
          
          {/* Active Channel */}
          <div className="bg-[#36393F] text-white rounded px-2 py-1 cursor-pointer transition">
            <div className="flex items-center">
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
                <path d="M7 20l4-16m2 16l4-16"/>
              </svg>
              <span>bot-logs</span>
            </div>
          </div>
        </div>
        
        {/* Settings Section */}
        <div className="mt-2">
          <div className="flex items-center px-1 text-[#B9BBBE] uppercase text-xs font-semibold mb-1">
            <span>Settings</span>
          </div>
          
          <div className="text-[#B9BBBE] hover:text-white hover:bg-[#4F545C] rounded px-2 py-1 cursor-pointer transition">
            <div className="flex items-center">
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
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
              <span>configuration</span>
            </div>
          </div>
          
          <div className="text-[#B9BBBE] hover:text-white hover:bg-[#4F545C] rounded px-2 py-1 cursor-pointer transition">
            <div className="flex items-center">
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
                <path d="M3 3v18h18"/>
                <path d="m19 9-5 5-4-4-3 3"/>
              </svg>
              <span>statistics</span>
            </div>
          </div>
        </div>
      </div>
      
      {/* User Info */}
      <div className="p-2 bg-[#292b2f] flex items-center">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-full bg-[#5865F2] flex items-center justify-center">
            <span className="text-sm font-bold">A</span>
          </div>
          <div>
            <div className="text-sm font-medium">Admin</div>
            <div className="text-xs text-[#B9BBBE]">#1234</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChannelSidebar;
