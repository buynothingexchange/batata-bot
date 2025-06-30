import { useState } from "react";
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

const exchangeFormSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters"),
  description: z.string().min(10, "Description must be at least 10 characters"),
  category: z.enum(["electronics", "clothing", "accessories", "home_furniture", "footwear", "misc"]),
  type: z.enum(["give", "request", "trade"]),
  location: z.string().optional(),
  image: z.instanceof(File).optional(),
});

type ExchangeFormData = z.infer<typeof exchangeFormSchema>;

export default function ExchangeForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const form = useForm<ExchangeFormData>({
    resolver: zodResolver(exchangeFormSchema),
    defaultValues: {
      title: "",
      description: "",
      location: "",
    },
  });

  const onSubmit = async (data: ExchangeFormData) => {
    setIsSubmitting(true);
    
    try {
      let imageUrl = "";
      
      // Upload image if provided
      if (data.image) {
        const formData = new FormData();
        formData.append("image", data.image);
        
        // First upload to Imgur (you'll need to implement this endpoint)
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
    <div className="container max-w-2xl mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle>Create Exchange Post</CardTitle>
          <CardDescription>
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
                    <FormLabel>Exchange Type</FormLabel>
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
                    <FormLabel>Category</FormLabel>
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
                    <FormLabel>Title</FormLabel>
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
                    <FormLabel>Description</FormLabel>
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
                    <FormLabel>Location (Optional)</FormLabel>
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
                    <FormLabel>Image (Optional)</FormLabel>
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
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" disabled={isSubmitting} className="w-full">
                {isSubmitting ? "Creating Post..." : "Create Exchange Post"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}