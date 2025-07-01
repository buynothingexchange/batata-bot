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

const baseExchangeFormSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters"),
  description: z.string().min(10, "Description must be at least 10 characters"),
  category: z.enum(["electronics", "clothing", "accessories", "home_furniture", "footwear", "misc"]),
  type: z.enum(["give", "request", "trade"]),
  location: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
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

export default function ExchangeForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapInitialized, setMapInitialized] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const circleRef = useRef<any>(null);
  const { toast } = useToast();

  // Extract token from URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get('token');
    setToken(urlToken);
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
      location: "",
      lat: 43.7,
      lng: -79.4,
    },
    mode: "onChange", // Enable real-time validation
  });

  // Watch the exchange type to update validation
  const watchedType = form.watch("type");

  // Load Leaflet dynamically and initialize map
  useEffect(() => {
    const loadLeaflet = async () => {
      // Add Leaflet CSS first and wait for it to load
      if (!document.querySelector('link[href*="leaflet.css"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
        link.crossOrigin = '';
        document.head.appendChild(link);
        
        // Wait for CSS to load before loading JS
        link.onload = () => {
          console.log('Leaflet CSS loaded successfully');
          loadLeafletJS();
        };
        link.onerror = () => {
          console.error('Failed to load Leaflet CSS');
          loadLeafletJS(); // Try to continue anyway
        };
      } else {
        loadLeafletJS();
      }
      
      function loadLeafletJS() {
        // Add Leaflet JS
        if (!window.L) {
          const script = document.createElement('script');
          script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
          script.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
          script.crossOrigin = '';
          script.onload = () => {
            console.log('Leaflet JS loaded successfully');
            setMapLoaded(true);
          };
          script.onerror = () => {
            console.error('Failed to load Leaflet JS');
          };
          document.head.appendChild(script);
        } else {
          console.log('Leaflet already available');
          setMapLoaded(true);
        }
      }
    };

    loadLeaflet();
  }, []);

  // Initialize map when Leaflet is loaded
  useEffect(() => {
    if (mapLoaded && mapRef.current && !mapInstanceRef.current) {
      // Add a small delay to ensure DOM is ready
      const timeoutId = setTimeout(() => {
        if (!mapRef.current) return;
        
        try {
          console.log('Initializing Leaflet map...');
          console.log('Map container:', mapRef.current);
          console.log('Container dimensions:', mapRef.current.offsetWidth, 'x', mapRef.current.offsetHeight);
          
          // Clear any existing content
          mapRef.current.innerHTML = '';
          
          const map = window.L.map(mapRef.current, {
            preferCanvas: true,
            attributionControl: true
          }).setView([43.7, -79.4], 11);

        // Add tile layer with error handling
        const tileLayer = window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
          maxZoom: 19,
          tileSize: 256,
          zoomOffset: 0
        });
        
        tileLayer.on('tileerror', (e: any) => {
          console.error('Tile loading error:', e);
        });
        
        tileLayer.addTo(map);

        const circle = window.L.circle([43.7, -79.4], {
          color: 'green',
          fillColor: '#3f9e2f',
          fillOpacity: 0.4,
          radius: 2000
        }).addTo(map);

        const marker = window.L.marker([43.7, -79.4], { draggable: true }).addTo(map);

        marker.on('drag', function(e: any) {
          circle.setLatLng(e.latlng);
          form.setValue('lat', parseFloat(e.latlng.lat.toFixed(4)));
          form.setValue('lng', parseFloat(e.latlng.lng.toFixed(4)));
        });

        // Ensure map renders properly
        setTimeout(() => {
          map.invalidateSize();
          console.log('Map invalidated and should be visible');
        }, 100);

        mapInstanceRef.current = map;
        markerRef.current = marker;
        circleRef.current = circle;
        setMapInitialized(true);
        
          console.log('Map initialized successfully');
        } catch (error) {
          console.error('Error initializing map:', error);
        }
      }, 500); // 500ms delay
      
      // Cleanup function
      return () => clearTimeout(timeoutId);
    }
  }, [mapLoaded, form]);

  // Update form validation when exchange type changes
  useEffect(() => {
    if (watchedType) {
      // Clear any existing image validation errors when switching types
      form.clearErrors("image");
      // Trigger validation for the image field with the new rules
      form.trigger("image");
    }
  }, [watchedType, form]);

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
        location: data.location || "",
        lat: data.lat || 43.7,
        lng: data.lng || -79.4,
      };

      const response = await fetch("/api/new-post", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(postData),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        toast({
          title: "Success!",
          description: "Your exchange post has been created in Discord.",
        });
        form.reset();
        // Reset map position
        if (markerRef.current && circleRef.current) {
          markerRef.current.setLatLng([43.7, -79.4]);
          circleRef.current.setLatLng([43.7, -79.4]);
          if (mapInstanceRef.current) {
            mapInstanceRef.current.setView([43.7, -79.4], 11);
          }
        }
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

  return (
    <div className="min-h-screen bg-gray-950 py-8">
      <div className="container max-w-2xl mx-auto p-6">
        <Card className="bg-gray-900 border-gray-800 shadow-2xl">
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
              <div className="bg-green-900/20 border border-green-600 rounded-lg p-3 mt-4 flex items-center gap-3">
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
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
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
                  <FormItem>
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
                  <FormItem>
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
                  <FormItem>
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

              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-gray-200">Location <span className="text-gray-400">(Optional)</span></FormLabel>
                    <FormControl>
                      <Input placeholder="Your general location or pickup area" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-2">
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
                  Drag the marker to select your approximate location. The green circle shows a 2km radius area.
                </p>
              </div>

              <FormField
                control={form.control}
                name="image"
                render={({ field: { onChange, value, ...field } }) => (
                  <FormItem>
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