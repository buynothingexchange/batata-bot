import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/Dashboard";
import ExchangeForm from "@/pages/ExchangeForm";
import MapTest from "@/pages/MapTest";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/exchange" component={ExchangeForm} />
      <Route path="/maptest" component={MapTest} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router />
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
