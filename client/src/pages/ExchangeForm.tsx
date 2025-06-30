import { useState, useEffect } from "react";
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
  title: z.string().min(3, "Title must be at least 3 characters"),
  description: z.string().min(10, "Description must be at least 10 characters"),
  category: z.enum(["electronics", "clothing", "accessories", "home_furniture", "footwear", "misc"]),
  type: z.enum(["give", "request", "trade"]),
  location: z.string().optional(),
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

export default function ExchangeForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const form = useForm<ExchangeFormData>({
    resolver: zodResolver(baseExchangeFormSchema),
    defaultValues: {
      title: "",
      description: "",
      location: "",
    },
    mode: "onChange", // Enable real-time validation
  });

  // Watch the exchange type to update validation
  const watchedType = form.watch("type");

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