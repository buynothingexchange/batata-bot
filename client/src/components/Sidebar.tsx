import { useState } from "react";

const Sidebar = () => {
  return (
    <div className="w-20 bg-[#2C2F33] h-full flex flex-col items-center py-4 md:flex">
      {/* Bot Icon */}
      <div className="flex flex-col items-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-[#5865F2] flex items-center justify-center cursor-pointer transition hover:rounded-xl">
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            className="h-6 w-6" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round"
          >
            <rect width="18" height="10" x="3" y="11" rx="2"/>
            <circle cx="12" cy="5" r="2"/>
            <path d="M12 7v4"/>
            <line x1="8" x2="8" y1="16" y2="16"/>
            <line x1="16" x2="16" y1="16" y2="16"/>
          </svg>
        </div>
        <div className="w-12 h-0.5 bg-[#4F545C] rounded-full"></div>
      </div>
      
      {/* Server List */}
      <div className="mt-4 flex flex-col items-center space-y-4 flex-grow overflow-y-auto scrollbar-custom">
        {/* Active Server */}
        <div className="w-12 h-12 rounded-xl bg-[#57F287] flex items-center justify-center cursor-pointer relative">
          <span className="absolute -left-1 w-2 h-8 bg-white rounded-r-full"></span>
          <span className="text-lg font-bold">C</span>
        </div>
        
        {/* Add Server */}
        <div className="w-12 h-12 rounded-full bg-[#4F545C] hover:bg-[#57F287] hover:rounded-xl transition-all duration-200 flex items-center justify-center cursor-pointer">
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            className="h-6 w-6 text-[#57F287] group-hover:text-white" 
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
        </div>
      </div>
      
      {/* User Settings */}
      <div className="mt-auto flex flex-col items-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-[#4F545C] hover:bg-[#5865F2] hover:rounded-xl transition-all duration-200 flex items-center justify-center cursor-pointer">
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            className="h-6 w-6" 
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
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
