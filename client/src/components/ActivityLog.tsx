import { Log } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

interface ActivityLogProps {
  logs: Log[];
  isLoading: boolean;
}

// Group logs by date
const groupLogsByDate = (logs: Log[]) => {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  const todayString = today.toDateString();
  const yesterdayString = yesterday.toDateString();
  
  return logs.reduce<{ [key: string]: Log[] }>((groups, log) => {
    const logDate = new Date(log.timestamp);
    let dateGroup = '';
    
    if (logDate.toDateString() === todayString) {
      dateGroup = 'Today';
    } else if (logDate.toDateString() === yesterdayString) {
      dateGroup = 'Yesterday';
    } else {
      dateGroup = format(logDate, 'MMMM d, yyyy');
    }
    
    if (!groups[dateGroup]) {
      groups[dateGroup] = [];
    }
    
    groups[dateGroup].push(log);
    return groups;
  }, {});
};

const ActivityLog = ({ logs, isLoading }: ActivityLogProps) => {
  const groupedLogs = groupLogsByDate(logs);
  
  if (isLoading) {
    return (
      <div className="flex-grow overflow-y-auto scrollbar-custom p-4">
        <div className="mb-4">
          <h3 className="text-lg font-bold mb-2 flex items-center">
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
              <path d="M3 12h18"/>
              <path d="M3 6h18"/>
              <path d="M3 18h18"/>
            </svg>
            Bot Activity Log
          </h3>
          <div className="space-y-4">
            <div className="mb-6">
              <div className="text-xs text-[#B9BBBE] uppercase mb-2 font-bold">Today</div>
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-[#32353b] p-3 rounded-md mb-2">
                  <div className="flex">
                    <Skeleton className="w-10 h-10 rounded-full mr-3" />
                    <div className="w-full">
                      <Skeleton className="h-5 w-48 mb-2" />
                      <Skeleton className="h-4 w-full" />
                      <div className="mt-2 bg-[#2b2d31] p-2 rounded">
                        <Skeleton className="h-4 w-32 mb-1" />
                        <Skeleton className="h-4 w-full" />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="flex-grow overflow-y-auto scrollbar-custom p-4">
      <div className="mb-4">
        <h3 className="text-lg font-bold mb-2 flex items-center">
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
            <path d="M3 3v18h18"/>
            <path d="m19 9-5 5-4-4-3 3"/>
          </svg>
          Bot Activity Log
        </h3>
        
        <div className="space-y-4">
          {Object.entries(groupedLogs).length > 0 ? (
            Object.entries(groupedLogs).map(([date, dateLogs]) => (
              <div key={date} className="mb-6">
                <div className="text-xs text-[#B9BBBE] uppercase mb-2 font-bold">{date}</div>
                
                {dateLogs.map((log, index) => (
                  <div 
                    key={log.id} 
                    className={`bg-[#32353b] p-3 rounded-md mb-2 ${log.status === 'success' ? 'border-l-4 border-[#57F287]' : ''}`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex items-start">
                        <div className="w-10 h-10 rounded-full bg-[#2C2F33] flex items-center justify-center mr-3 flex-shrink-0">
                          <svg 
                            xmlns="http://www.w3.org/2000/svg" 
                            className="h-5 w-5 text-[#5865F2]" 
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
                        <div>
                          <div className="flex items-center">
                            <span className={`font-semibold ${index === 0 && date === 'Today' ? 'text-[#57F287]' : ''}`}>ClaimBot</span>
                            <span className="text-xs text-[#B9BBBE] ml-2">
                              {format(new Date(log.timestamp), 'p')}
                            </span>
                          </div>
                          <div className="mt-1">
                            {log.status === 'success' ? (
                              <>
                                Added reaction <span className="text-[#FEE75C]">{log.emoji}</span> to image in <span className="text-[#5865F2]">#{log.channel}</span>
                              </>
                            ) : (
                              <>
                                Failed to add reaction in <span className="text-[#5865F2]">#{log.channel}</span>
                              </>
                            )}
                          </div>
                          <div className="mt-2 bg-[#2b2d31] p-2 rounded text-sm">
                            <div className="text-[#B9BBBE] font-mono">{log.command}</div>
                            <div className="flex items-center mt-1">
                              <span className={`font-semibold ${log.status === 'success' ? 'text-[#57F287]' : 'text-[#ED4245]'}`}>
                                {log.status === 'success' ? 'Success:' : 'Error:'}
                              </span>
                              <span className="ml-1">{log.message}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))
          ) : (
            <div className="bg-[#32353b] p-4 rounded-md text-center">
              <p className="text-[#B9BBBE]">No activity logs yet. Use the bot and check back later.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ActivityLog;
