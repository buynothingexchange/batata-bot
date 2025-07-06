// Copy this file as: client/src/pages/ExchangeForm.tsx
// Web form component for creating exchange requests

import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPin, Upload, User, Package, Navigation } from 'lucide-react';

// Form validation schema
const exchangeFormSchema = z.object({
  title: z.string().min(5, 'Title must be at least 5 characters').max(100, 'Title too long'),
  description: z.string().min(10, 'Description must be at least 10 characters').max(1000, 'Description too long'),
  category: z.enum(['electronics', 'home_furniture', 'clothing', 'accessories', 'footwear', 'misc']),
  type: z.enum(['request', 'trade', 'give']),
  username: z.string().min(1, 'Username is required').max(50, 'Username too long'),
  location: z.string().optional(),
  image: z.any().optional(),
  lat: z.number().optional(),
  lng: z.number().optional()
});

type ExchangeFormData = z.infer<typeof exchangeFormSchema>;

interface ExchangeFormProps {
  token?: string;
}

export default function ExchangeForm({ token }: ExchangeFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [mapPosition, setMapPosition] = useState({ lat: 43.6532, lng: -79.3832 }); // Toronto default
  const [currentLocation, setCurrentLocation] = useState('Toronto, ON');
  const [isValidToken, setIsValidToken] = useState(false);
  const [tokenInfo, setTokenInfo] = useState<any>(null);

  const form = useForm<ExchangeFormData>({
    resolver: zodResolver(exchangeFormSchema),
    defaultValues: {
      title: '',
      description: '',
      category: 'misc',
      type: 'request',
      username: '',
      location: '',
      lat: mapPosition.lat,
      lng: mapPosition.lng
    }
  });

  const selectedType = form.watch('type');

  // Validate token on mount
  useEffect(() => {
    if (!token) {
      setSubmitError('Invalid or missing access token');
      return;
    }

    const validateToken = async () => {
      try {
        const response = await fetch(`/api/validate-token/${token}`);
        if (response.ok) {
          const data = await response.json();
          setIsValidToken(true);
          setTokenInfo(data);
          form.setValue('username', data.username);
        } else {
          setSubmitError('Invalid or expired access token');
        }
      } catch (error) {
        setSubmitError('Error validating access token');
      }
    };

    validateToken();
  }, [token, form]);

  // Load remembered location from localStorage
  useEffect(() => {
    const rememberedLocation = localStorage.getItem('exchangeFormLocation');
    if (rememberedLocation) {
      try {
        const location = JSON.parse(rememberedLocation);
        setMapPosition(location);
        form.setValue('lat', location.lat);
        form.setValue('lng', location.lng);
      } catch (error) {
        console.error('Error loading remembered location:', error);
      }
    }
  }, [form]);

  // Reverse geocoding to get location name
  const getLocationName = async (lat: number, lng: number): Promise<string> => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=15&addressdetails=1`,
        {
          headers: {
            'User-Agent': 'BNE-Bot/1.0 (Exchange location service)'
          }
        }
      );
      
      const data = await response.json();
      
      if (data && data.address) {
        const neighborhood = data.address.neighbourhood || 
                            data.address.suburb || 
                            data.address.city || 
                            data.address.town || 
                            'Unknown Location';
        
        const city = data.address.city || data.address.town || '';
        
        if (city && neighborhood !== city) {
          return `${neighborhood}, ${city}`;
        }
        
        return neighborhood;
      }
      
      return 'Unknown Location';
    } catch (error) {
      console.error('Error getting location name:', error);
      return 'Unknown Location';
    }
  };

  // Handle map marker drag
  const handleMapChange = async (lat: number, lng: number) => {
    setMapPosition({ lat, lng });
    form.setValue('lat', lat);
    form.setValue('lng', lng);
    
    // Save to localStorage
    localStorage.setItem('exchangeFormLocation', JSON.stringify({ lat, lng }));
    
    // Get location name
    const locationName = await getLocationName(lat, lng);
    setCurrentLocation(locationName);
  };

  // Handle image upload
  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setImageFile(file);
      
      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Submit form
  const onSubmit = async (data: ExchangeFormData) => {
    if (!isValidToken) {
      setSubmitError('Invalid access token');
      return;
    }

    // Validate image requirement for "give" type
    if (data.type === 'give' && !imageFile) {
      setSubmitError('Image is required when offering items');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      let imageUrl = null;

      // Upload image if provided
      if (imageFile) {
        const formData = new FormData();
        formData.append('image', imageFile);

        const uploadResponse = await fetch('/api/upload-image', {
          method: 'POST',
          body: formData
        });

        if (uploadResponse.ok) {
          const uploadData = await uploadResponse.json();
          imageUrl = uploadData.url;
        } else {
          throw new Error('Failed to upload image');
        }
      }

      // Submit form data
      const submitData = {
        ...data,
        image_url: imageUrl,
        user_id: tokenInfo.userId,
        lat: mapPosition.lat,
        lng: mapPosition.lng
      };

      console.log('Submitting form data:', submitData);

      const response = await fetch('/api/new-post', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(submitData)
      });

      if (response.ok) {
        setSubmitSuccess(true);
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create post');
      }
    } catch (error) {
      console.error('Form submission error:', error);
      setSubmitError(error instanceof Error ? error.message : 'An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Show token validation error
  if (!isValidToken && token) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-red-600">Access Denied</CardTitle>
            <CardDescription>
              {submitError || 'Invalid or expired access token'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Please request a new form link using the /exchange command in Discord.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show success page
  if (submitSuccess) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-2xl">
          <CardHeader>
            <CardTitle className="text-green-600 flex items-center gap-2">
              <Package className="h-6 w-6" />
              Exchange Request Created!
            </CardTitle>
            <CardDescription>
              Your exchange request has been successfully posted to the Discord forum.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted p-4 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <User className="h-4 w-4" />
                <span className="font-medium">{form.getValues('username')}</span>
              </div>
              <h3 className="font-semibold">{form.getValues('title')}</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {form.getValues('description')}
              </p>
              <div className="flex gap-2 mt-2">
                <Badge variant="secondary">{form.getValues('category')}</Badge>
                <Badge variant="outline">
                  {form.getValues('type') === 'give' ? 'Offer' : 
                   form.getValues('type').charAt(0).toUpperCase() + form.getValues('type').slice(1)}
                </Badge>
              </div>
            </div>
            
            <div className="space-y-2">
              <h4 className="font-medium">Next Steps:</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• You'll automatically follow your post for notifications</li>
                <li>• Your post will be auto-bumped if inactive for 7 days</li>
                <li>• Use <code>/markfulfilled tradedwith:@username</code> when completed</li>
              </ul>
            </div>
            
            <div className="flex gap-2">
              <Button onClick={() => window.location.reload()} variant="outline">
                Create Another Post
              </Button>
              <Button onClick={() => window.close()}>
                Close
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Main form
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-4 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="text-green-600">Create Exchange Request</CardTitle>
            <CardDescription>
              Fill out the form below to create your exchange request. All fields marked with * are required.
            </CardDescription>
          </CardHeader>
          
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                
                {/* Username */}
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-green-600">Discord Username *</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Your Discord username" disabled />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Title */}
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-green-600">Title *</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Briefly describe what you're looking for" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Category */}
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-green-600">Category *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a category" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="electronics">📱 Electronics</SelectItem>
                          <SelectItem value="home_furniture">🏠 Home & Furniture</SelectItem>
                          <SelectItem value="clothing">👕 Clothing</SelectItem>
                          <SelectItem value="accessories">👜 Accessories</SelectItem>
                          <SelectItem value="footwear">👟 Footwear</SelectItem>
                          <SelectItem value="misc">📦 Miscellaneous</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Exchange Type */}
                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-green-600">Exchange Type *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select exchange type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="request">🔍 Request - Looking for something</SelectItem>
                          <SelectItem value="trade">🔄 Trade - Want to exchange items</SelectItem>
                          <SelectItem value="give">🎁 Give - Offering something for free</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Description */}
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-green-600">Description *</FormLabel>
                      <FormControl>
                        <Textarea 
                          {...field} 
                          placeholder="Provide details about what you're looking for, condition preferences, etc."
                          className="min-h-24"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Image Upload */}
                <FormField
                  control={form.control}
                  name="image"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-green-600">
                        Image {selectedType === 'give' ? '(Required)' : '(Optional)'}
                      </FormLabel>
                      <FormControl>
                        <div className="space-y-2">
                          <Input
                            type="file"
                            accept="image/*"
                            onChange={handleImageChange}
                            className="cursor-pointer"
                          />
                          {selectedType === 'give' && (
                            <p className="text-sm text-muted-foreground">
                              Images are required when offering items to show their condition.
                            </p>
                          )}
                          {imagePreview && (
                            <div className="mt-2">
                              <img 
                                src={imagePreview} 
                                alt="Preview" 
                                className="max-w-48 h-auto rounded border"
                              />
                            </div>
                          )}
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Location */}
                <FormField
                  control={form.control}
                  name="location"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-green-600 flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        Location
                      </FormLabel>
                      <FormControl>
                        <div className="space-y-2">
                          <div className="bg-muted p-3 rounded-lg">
                            <p className="text-sm font-medium">Remembered Location:</p>
                            <p className="text-sm text-muted-foreground">{currentLocation}</p>
                          </div>
                          
                          {/* Simple map placeholder - in real implementation, you'd use a proper map library */}
                          <div className="bg-muted border-2 border-dashed border-border rounded-lg p-8 text-center">
                            <Navigation className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                            <p className="text-sm text-muted-foreground">
                              Interactive map would be here
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              Coordinates: {mapPosition.lat.toFixed(4)}, {mapPosition.lng.toFixed(4)}
                            </p>
                          </div>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Submit */}
                <div className="flex gap-2">
                  <Button 
                    type="submit" 
                    disabled={isSubmitting || !isValidToken}
                    className="flex-1"
                  >
                    {isSubmitting ? (
                      <>
                        <Upload className="mr-2 h-4 w-4 animate-spin" />
                        Creating Post...
                      </>
                    ) : (
                      <>
                        <Package className="mr-2 h-4 w-4" />
                        Create Exchange Request
                      </>
                    )}
                  </Button>
                </div>

                {/* Error display */}
                {submitError && (
                  <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
                    <p className="text-sm text-destructive">{submitError}</p>
                  </div>
                )}
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}