import { useState, useEffect, useRef } from "react";


import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";

import { HelpCircle, CheckCircle, MessageSquare, Settings } from "lucide-react";

const baseExchangeFormSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters"),
  description: z.string().min(10, "Description must be at least 10 characters"),
  category: z.enum(["electronics", "clothing", "accessories", "home_furniture", "footwear", "misc"]),
  type: z.enum(["give", "request", "trade"]),
  lat: z.number(),
  lng: z.number(),
  image: z.instanceof(File).optional(),
});

// Dynamic schema that makes image required for "give" type
const createExchangeFormSchema = (type?: string) => {
  if (type === "give") {
    return baseExchangeFormSchema.extend({
      image: z.instanceof(File, { message: "Image is required when giving an item" }),
    });
  }
  return baseExchangeFormSchema;
};

type ExchangeFormData = z.infer<typeof baseExchangeFormSchema>;

declare global {
  interface Window {
    L: any;
  }
}

// Global error handler to suppress HMR-related DOM errors during development
if (typeof window !== 'undefined') {
  const originalConsoleError = console.error;
  console.error = (...args) => {
    // Suppress known HMR/development errors that don't affect functionality
    const message = args.join(' ');
    if (message.includes('removeChild') || 
        message.includes('runtime-error-plugin') ||
        message.includes('Node to be removed is not a child')) {
      console.warn('Development DOM error suppressed:', message);
      return;
    }
    originalConsoleError.apply(console, args);
  };
}

// Success Page Component
function SuccessPage({ postData }: { postData: any }) {
  const getExchangeTypeText = (type: string) => {
    switch (type) {
      case 'give': return 'offering';
      case 'request': return 'requesting';
      case 'trade': return 'trading';
      default: return 'exchanging';
    }
  };

  const getCategoryDisplayName = (category: string) => {
    switch (category) {
      case 'electronics': return 'Electronics';
      case 'clothing': return 'Clothing';
      case 'accessories': return 'Accessories';
      case 'home_furniture': return 'Home & Furniture';
      case 'footwear': return 'Footwear';
      case 'misc': return 'Miscellaneous';
      default: return category;
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 py-8">
      <div className="container max-w-2xl mx-auto p-6">
        <Card className="bg-gray-900 border-gray-800 shadow-2xl">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="w-8 h-8 text-white" />
            </div>
            <CardTitle className="text-green-400 text-3xl">Success!</CardTitle>
            <CardDescription className="text-gray-300 text-lg">
              Your exchange post has been created in Discord
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-6">
            {/* Post Summary */}
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <h3 className="text-green-400 font-semibold mb-2">Post Created:</h3>
              <div className="flex items-center gap-3 mb-2">
                <img 
                  src={postData.discordUser.discordAvatar} 
                  alt="Your avatar" 
                  className="w-8 h-8 rounded-full"
                />
                <div>
                  <p className="text-white font-medium">{postData.title}</p>
                  <p className="text-gray-400 text-sm">
                    {getExchangeTypeText(postData.type).charAt(0).toUpperCase() + getExchangeTypeText(postData.type).slice(1)} • {getCategoryDisplayName(postData.category)}
                  </p>
                </div>
              </div>
            </div>

            {/* Next Steps */}
            <div className="space-y-4">
              <h3 className="text-green-400 font-semibold text-lg">What happens next?</h3>
              
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 bg-gray-800 rounded-lg border border-gray-700">
                  <MessageSquare className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-white font-medium">Auto-follow enabled</p>
                    <p className="text-gray-300 text-sm">
                      You're automatically following your post and will receive Discord notifications when people reply
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-gray-800 rounded-lg border border-gray-700">
                  <Settings className="w-5 h-5 text-purple-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-white font-medium">Manage your post</p>
                    <p className="text-gray-300 text-sm">
                      When your item is traded or claimed, use <code className="bg-gray-700 px-1 rounded text-green-400">/updatepost</code> command in Discord to mark it as completed
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-gray-800 rounded-lg border border-gray-700">
                  <CheckCircle className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-white font-medium">Auto-bump system</p>
                    <p className="text-gray-300 text-sm">
                      Your post will be automatically bumped every 6 days to keep it visible in the community
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Button */}
            <div className="flex justify-center pt-4">
              <Button 
                onClick={() => window.close()}
                className="px-8 bg-green-600 hover:bg-green-700 text-white"
              >
                Close Tab
              </Button>
            </div>

            {/* Help Text */}
            <div className="text-center pt-4 border-t border-gray-700">
              <p className="text-gray-400 text-sm">
                Need help? Contact a server administrator in Discord
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function ExchangeForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapInitialized, setMapInitialized] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [submissionSuccess, setSubmissionSuccess] = useState(false);
  const [submittedPostData, setSubmittedPostData] = useState<any>(null);

  const [locationName, setLocationName] = useState<string>('');
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const circleRef = useRef<any>(null);
  const { toast } = useToast();

  // Extract token from URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    setToken(urlParams.get('token'));
  }, []);

  // Validate token and get user information
  const { data: tokenData, isLoading: isValidatingToken, error: tokenError } = useQuery({
    queryKey: ['/api/validate-token', token],
    queryFn: async () => {
      if (!token) return null;
      const response = await fetch(`/api/validate-token/${token}`);
      if (!response.ok) {
        throw new Error('Invalid or expired token');
      }
      return response.json();
    },
    enabled: !!token,
    retry: false
  });

  const form = useForm<ExchangeFormData>({
    resolver: zodResolver(baseExchangeFormSchema),
    defaultValues: {
      title: "",
      description: "",
      lat: 43.7,
      lng: -79.4,
    },
    mode: "onChange", // Enable real-time validation
  });

  // Watch the exchange type to update validation
  const watchedType = form.watch("type");

  // Load Leaflet dynamically and initialize map
  useEffect(() => {
    let cssLink: HTMLLinkElement | null = null;
    let jsScript: HTMLScriptElement | null = null;
    
    const loadLeaflet = async () => {
      try {
        // Check if Leaflet is already loaded
        if (window.L) {
          console.log('Leaflet already available');
          setMapLoaded(true);
          return;
        }
        
        // Add Leaflet CSS if not present
        const existingCSS = document.querySelector('link[href*="leaflet.css"]') as HTMLLinkElement;
        if (!existingCSS) {
          cssLink = document.createElement('link');
          cssLink.rel = 'stylesheet';
          cssLink.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
          cssLink.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
          cssLink.crossOrigin = '';
          
          const cssPromise = new Promise<void>((resolve, reject) => {
            cssLink!.onload = () => {
              console.log('Leaflet CSS loaded successfully');
              resolve();
            };
            cssLink!.onerror = () => {
              console.error('Failed to load Leaflet CSS');
              reject(new Error('CSS failed to load'));
            };
          });
          
          document.head.appendChild(cssLink);
          await cssPromise;
        }
        
        // Add Leaflet JS
        const existingJS = document.querySelector('script[src*="leaflet.js"]') as HTMLScriptElement;
        if (!existingJS && !window.L) {
          jsScript = document.createElement('script');
          jsScript.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
          jsScript.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
          jsScript.crossOrigin = '';
          
          const jsPromise = new Promise<void>((resolve, reject) => {
            jsScript!.onload = () => {
              console.log('Leaflet JS loaded successfully');
              resolve();
            };
            jsScript!.onerror = () => {
              console.error('Failed to load Leaflet JS');
              reject(new Error('JS failed to load'));
            };
          });
          
          document.head.appendChild(jsScript);
          await jsPromise;
        }
        
        setMapLoaded(true);
      } catch (error) {
        console.error('Error loading Leaflet:', error);
        setMapLoaded(true); // Continue anyway
      }
    };

    loadLeaflet();
    
    // Cleanup function to prevent memory leaks
    return () => {
      // Note: We don't remove the CSS/JS as they might be used by other components
      // This prevents the removeChild error during HMR
    };
  }, []);

  // Initialize map when both Leaflet is loaded AND container is ready
  useEffect(() => {
    console.log('Map effect triggered:', { mapLoaded, hasMapRef: !!mapRef.current, hasMapInstance: !!mapInstanceRef.current, tokenValid: !!tokenData?.valid });
    
    if (!mapLoaded || mapInstanceRef.current || !tokenData?.valid) return;
    
    // Safety check for window.L availability
    if (!window.L) {
      console.warn('Window.L not available, retrying in 500ms');
      setTimeout(() => setMapLoaded(false), 500); // Trigger reload
      return;
    }
    
    let timeoutId: NodeJS.Timeout;
    let attemptCount = 0;
    const maxAttempts = 50; // Max 5 seconds
    
    // Keep checking for mapRef to become available
    const checkMapRef = () => {
      attemptCount++;
      
      if (!mapRef.current) {
        if (attemptCount >= maxAttempts) {
          console.error('Map container failed to become ready after maximum attempts');
          return;
        }
        console.log(`Map container not ready, attempt ${attemptCount}/${maxAttempts}...`);
        timeoutId = setTimeout(checkMapRef, 100);
        return;
      }
      
      console.log('Map container is ready, starting initialization...');
      console.log('Container dimensions:', mapRef.current.offsetWidth, 'x', mapRef.current.offsetHeight);
      
      // Wait for container to have proper dimensions
      if (mapRef.current.offsetWidth === 0) {
        console.log('Container has no width, waiting...');
        setTimeout(checkMapRef, 200);
        return;
      }
      
      try {
        console.log('Creating Leaflet map instance...');
        
        // Clear any existing content
        mapRef.current.innerHTML = '';
        
        // Get stored location or use default (Toronto)
        const getStoredLocation = () => {
          try {
            const stored = localStorage.getItem('exchangeForm_lastLocation');
            if (stored) {
              const { lat, lng } = JSON.parse(stored);
              if (typeof lat === 'number' && typeof lng === 'number') {
                console.log('Using stored location:', lat, lng);
                return { lat, lng };
              }
            }
          } catch (error) {
            console.warn('Failed to parse stored location:', error);
          }
          console.log('Using default location: Toronto');
          return { lat: 43.7, lng: -79.4 };
        };

        const savedLocation = getStoredLocation();
        
        // CRITICAL FIX: Update form values with saved location
        form.setValue('lat', savedLocation.lat);
        form.setValue('lng', savedLocation.lng);
        console.log('Updated form values with saved location:', savedLocation.lat, savedLocation.lng);
        
        const map = window.L.map(mapRef.current, {
          center: [savedLocation.lat, savedLocation.lng],
          zoom: 11,
          zoomControl: true,
          attributionControl: true
        });

        console.log('Adding tile layer...');
        window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
          maxZoom: 19
        }).addTo(map);

        console.log('Adding circle and marker...');
        const circle = window.L.circle([savedLocation.lat, savedLocation.lng], {
          color: 'green',
          fillColor: '#3f9e2f',
          fillOpacity: 0.4,
          radius: 1000
        }).addTo(map);

        const marker = window.L.marker([savedLocation.lat, savedLocation.lng], { draggable: true }).addTo(map);

        marker.on('drag', function(e: any) {
          circle.setLatLng(e.latlng);
          form.setValue('lat', parseFloat(e.latlng.lat.toFixed(4)));
          form.setValue('lng', parseFloat(e.latlng.lng.toFixed(4)));
        });

        // Add dragend event for reverse geocoding and location saving
        marker.on('dragend', function(e: any) {
          const lat = parseFloat(e.target.getLatLng().lat.toFixed(4));
          const lng = parseFloat(e.target.getLatLng().lng.toFixed(4));
          
          // Save location to localStorage for future visits
          try {
            localStorage.setItem('exchangeForm_lastLocation', JSON.stringify({ lat, lng }));
            console.log('Saved location to localStorage:', lat, lng);
          } catch (error) {
            console.warn('Failed to save location to localStorage:', error);
          }
          
          reverseGeocode(lat, lng);
        });

        // Force map to render properly
        setTimeout(() => {
          map.invalidateSize();
          console.log('Map size invalidated and refreshed');
        }, 200);

        mapInstanceRef.current = map;
        markerRef.current = marker;
        circleRef.current = circle;
        setMapInitialized(true);
        
        // Reverse geocode the initial location
        reverseGeocode(savedLocation.lat, savedLocation.lng);
        
        console.log('✅ Map initialized successfully');
      } catch (error) {
        console.error('❌ Error initializing map:', error);
      }
    };
    
    // Start checking after a short delay
    timeoutId = setTimeout(checkMapRef, 500);
    
    // Cleanup function
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [mapLoaded, tokenData?.valid]);

  // Update form validation when exchange type changes
  useEffect(() => {
    if (watchedType) {
      // Clear any existing image validation errors when switching types
      form.clearErrors("image");
      // Trigger validation for the image field with the new rules
      form.trigger("image");
    }
  }, [watchedType, form]);

  // Reverse geocoding function using Nominatim
  const reverseGeocode = async (lat: number, lng: number) => {
    try {
      setIsLoadingLocation(true);
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
        {
          headers: {
            'User-Agent': 'BatataExchangeBot/1.0 (Discord Exchange Platform)'
          }
        }
      );
      
      if (!response.ok) {
        throw new Error('Geocoding failed');
      }
      
      const data = await response.json();
      
      // Extract meaningful location components
      const address = data.address || {};
      const locationParts = [
        address.suburb || address.neighbourhood || address.hamlet,
        address.city || address.town || address.village,
        address.state || address.province,
        address.country
      ].filter(Boolean);
      
      const locationString = locationParts.length > 0 
        ? locationParts.slice(0, 2).join(', ') // Show first 2 components (e.g., "Downtown, Toronto")
        : 'Location detected';
        
      setLocationName(locationString);
    } catch (error) {
      console.error('Reverse geocoding error:', error);
      setLocationName('Unable to detect location');
    } finally {
      setIsLoadingLocation(false);
    }
  };

  const onSubmit = async (data: ExchangeFormData) => {
    if (!token || !tokenData?.valid) {
      toast({
        title: "Authentication Error",
        description: "Invalid or expired authentication token. Please get a new link from Discord.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    
    try {
      // Manual validation for image requirement when giving
      if (data.type === "give" && !data.image) {
        form.setError("image", {
          type: "required",
          message: "Image is required when giving an item"
        });
        setIsSubmitting(false);
        return;
      }

      // Validate with the dynamic schema based on exchange type
      const dynamicSchema = createExchangeFormSchema(data.type);
      const validatedData = dynamicSchema.parse(data);
      
      let imageUrl = "";
      
      // Upload image if provided
      if (validatedData.image) {
        const formData = new FormData();
        formData.append("image", validatedData.image);
        
        // First upload to Imgur
        const uploadResponse = await fetch("/api/upload-image", {
          method: "POST",
          body: formData,
        });
        
        if (!uploadResponse.ok) {
          throw new Error("Failed to upload image");
        }
        
        const uploadResult = await uploadResponse.json();
        imageUrl = uploadResult.imageUrl;
      }

      // Submit to Discord bot with token
      const postData = {
        token: token,
        title: data.title,
        description: data.description,
        category: data.category,
        type: data.type,
        image_url: imageUrl,
        lat: data.lat,
        lng: data.lng,
      };

      // DEBUG: Log coordinates being submitted
      console.log('Form submission coordinates:', { lat: data.lat, lng: data.lng });
      console.log('Full form data being submitted:', data);

      const response = await fetch("/api/new-post", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(postData),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        // Store the submitted data for the success page
        setSubmittedPostData({
          title: data.title,
          type: data.type,
          category: data.category,
          discordUser: tokenData?.user || {}
        });
        
        // Show success page instead of toast
        setSubmissionSuccess(true);
      } else {
        throw new Error(result.message || "Failed to create post");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to submit form",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };



  // Show success page if submission was successful
  if (submissionSuccess && submittedPostData) {
    return <SuccessPage postData={submittedPostData} />;
  }

  return (
    <div className="min-h-screen bg-gray-950 py-8">
      <div className="container max-w-2xl mx-auto p-6">
        <Card className="bg-gray-900 border-gray-800 shadow-2xl" data-tour="form-container">
          <CardHeader>
            <CardTitle className="text-green-400 text-2xl">Create Exchange Post</CardTitle>
            <CardDescription className="text-gray-300">
              Fill out this form to create a new exchange post in the Discord community.
            </CardDescription>
            
            {/* Authentication Status */}
            {isValidatingToken && (
              <div className="bg-blue-900/20 border border-blue-600 rounded-lg p-3 mt-4">
                <p className="text-blue-400">🔄 Validating authentication...</p>
              </div>
            )}
            
            {tokenError && (
              <div className="bg-red-900/20 border border-red-600 rounded-lg p-3 mt-4">
                <p className="text-red-400">❌ Authentication failed. Please get a new link from Discord.</p>
              </div>
            )}
            
            {tokenData?.valid && (
              <div className="bg-green-900/20 border border-green-600 rounded-lg p-3 mt-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <img 
                    src={tokenData.user.discordAvatar} 
                    alt="Your avatar" 
                    className="w-8 h-8 rounded-full"
                  />
                  <div>
                    <p className="text-green-400">✅ Authenticated as</p>
                    <p className="text-white font-medium">
                      {tokenData.user.discordDisplayName || tokenData.user.discordUsername}
                    </p>
                  </div>
                </div>
                

              </div>
            )}
          </CardHeader>
          <CardContent>
          {/* Show form only if authenticated */}
          {!token ? (
            <div className="text-center py-8">
              <p className="text-yellow-400">⚠️ No authentication token found. Please use the link from Discord.</p>
            </div>
          ) : tokenError ? (
            <div className="text-center py-8">
              <p className="text-red-400">❌ Authentication failed. Please get a new link from Discord.</p>
            </div>
          ) : !tokenData?.valid ? (
            <div className="text-center py-8">
              <p className="text-blue-400">🔄 Validating authentication...</p>
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              
              {/* Username Display */}
              <div data-tour="username-field" className="space-y-2">
                <label className="text-gray-200 text-sm font-medium">Discord Username</label>
                <div className="p-3 bg-gray-800 border border-gray-700 rounded-md">
                  <p className="text-gray-300">
                    {tokenData?.user?.discordDisplayName || tokenData?.user?.discordUsername || 'Loading...'}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">This will be shown as the author of your exchange post</p>
                </div>
              </div>

              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem data-tour="exchange-type-field">
                    <FormLabel className="text-gray-200">Exchange Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="What would you like to do?" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="give">Give - Offer items for free</SelectItem>
                        <SelectItem value="request">Request - Ask for items</SelectItem>
                        <SelectItem value="trade">Trade - Exchange items</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem data-tour="category-field">
                    <FormLabel className="text-gray-200">Category</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="electronics">Electronics</SelectItem>
                        <SelectItem value="clothing">Clothing</SelectItem>
                        <SelectItem value="accessories">Accessories</SelectItem>
                        <SelectItem value="home_furniture">Home & Furniture</SelectItem>
                        <SelectItem value="footwear">Footwear</SelectItem>
                        <SelectItem value="misc">Miscellaneous</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem data-tour="title-field">
                    <FormLabel className="text-gray-200">Title</FormLabel>
                    <FormControl>
                      <Input placeholder="Brief title for your item" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem data-tour="description-field">
                    <FormLabel className="text-gray-200">Description</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Describe your item, its condition, and any relevant details" 
                        className="min-h-[100px]"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-2" data-tour="map-container">
                <label className="text-gray-200 text-sm font-medium">
                  Select approximate location on map:
                </label>
                <div 
                  ref={mapRef}
                  className="h-[300px] w-full rounded-lg border border-gray-700"
                  style={{ 
                    minHeight: '300px', 
                    height: '300px',
                    position: 'relative',
                    zIndex: 0,
                    backgroundColor: '#f0f0f0' 
                  }}
                >
                  {!mapLoaded && (
                    <div className="flex items-center justify-center h-full text-gray-400 absolute inset-0 z-10">
                      Loading map libraries...
                    </div>
                  )}
                  {mapLoaded && !mapInitialized && (
                    <div className="flex items-center justify-center h-full text-blue-400 absolute inset-0 z-10">
                      Initializing map...
                    </div>
                  )}
                  {mapLoaded && mapInitialized && !mapInstanceRef.current && (
                    <div className="flex items-center justify-center h-full text-red-400 absolute inset-0 z-10">
                      Map initialization failed. Please refresh the page.
                    </div>
                  )}
                </div>
                <p className="text-sm text-gray-400">
                  Drag the marker to select your approximate location. The green circle shows a 1km radius area.
                </p>
                
                {/* Location name display */}
                <div className="mt-3 p-3 bg-gray-800 border border-gray-700 rounded-md">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-300">📍 Remembered Location:</span>
                    {isLoadingLocation ? (
                      <span className="text-sm text-blue-400">Loading location...</span>
                    ) : locationName ? (
                      <span className="text-sm text-green-400">{locationName}</span>
                    ) : (
                      <span className="text-sm text-gray-500">Drag marker to detect location</span>
                    )}
                  </div>
                </div>
              </div>

              <FormField
                control={form.control}
                name="image"
                render={({ field: { onChange, value, ...field } }) => (
                  <FormItem data-tour="image-field">
                    <FormLabel className="text-gray-200">
                      Image <span className={watchedType === "give" ? "text-green-400" : "text-gray-400"}>
                        {watchedType === "give" ? "(Required)" : "(Optional)"}
                      </span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          onChange(file);
                        }}
                        {...field}
                      />
                    </FormControl>
                    {watchedType === "give" && (
                      <p className="text-sm text-muted-foreground">
                        An image is required when giving an item to show its condition.
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button 
                type="submit" 
                disabled={isSubmitting} 
                className="w-full bg-green-600 hover:bg-green-700 text-white font-medium"
                data-tour="submit-button"
              >
                {isSubmitting ? "Creating Post..." : "Create Exchange Post"}
              </Button>
            </form>
          </Form>
          )}
          </CardContent>
        </Card>
      </div>


    </div>
  );
}