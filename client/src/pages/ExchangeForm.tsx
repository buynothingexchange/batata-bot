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

const baseExchangeFormSchema = z.object({
  username: z.string().min(2, "Username must be at least 2 characters"),
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
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const circleRef = useRef<any>(null);
  const { toast } = useToast();

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
      // Add Leaflet CSS
      if (!document.querySelector('link[href*="leaflet.css"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet/dist/leaflet.css';
        document.head.appendChild(link);
      }

      // Add Leaflet JS
      if (!window.L) {
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/leaflet/dist/leaflet.js';
        script.onload = () => {
          setMapLoaded(true);
        };
        document.head.appendChild(script);
      } else {
        setMapLoaded(true);
      }
    };

    loadLeaflet();
  }, []);

  // Initialize map when Leaflet is loaded
  useEffect(() => {
    if (mapLoaded && mapRef.current && !mapInstanceRef.current) {
      const map = window.L.map(mapRef.current).setView([43.7, -79.4], 11);

      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
      }).addTo(map);

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

      mapInstanceRef.current = map;
      markerRef.current = marker;
      circleRef.current = circle;
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

      // Submit to Discord bot
      const postData = {
        title: data.title,
        description: data.description,
        category: data.category,
        type: data.type,
        image_url: imageUrl,
        location: data.location || "",
        lat: data.lat || 43.7,
        lng: data.lng || -79.4,
        userId: "web-form-user", // You might want to implement user auth
        username: "Web Form User",
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
          </CardHeader>
          <CardContent>
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
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-gray-200">
                      Username <span className="text-green-400">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Your Discord username or display name" 
                        {...field} 
                        className="bg-gray-800 border-gray-700 text-white"
                      />
                    </FormControl>
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
                  className="h-[300px] w-full rounded-lg border border-gray-700 bg-gray-800"
                  style={{ minHeight: '300px' }}
                >
                  {!mapLoaded && (
                    <div className="flex items-center justify-center h-full text-gray-400">
                      Loading map...
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}