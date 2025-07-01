import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { X, ArrowLeft, ArrowRight, MapPin, Image, MessageSquare } from 'lucide-react';

interface TourStep {
  id: string;
  title: string;
  description: string;
  target: string;
  icon: React.ReactNode;
  position: 'top' | 'bottom' | 'left' | 'right';
  action?: string;
}

interface OnboardingTourProps {
  isVisible: boolean;
  onComplete: () => void;
  onSkip: () => void;
}

const tourSteps: TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Exchange Forms!',
    description: 'This quick tour will show you how to create exchange posts that will appear in your Discord server.',
    target: 'form-container',
    icon: <MessageSquare className="w-5 h-5" />,
    position: 'top'
  },
  {
    id: 'username',
    title: 'Your Discord Identity',
    description: 'This is automatically filled with your Discord username. It helps others know who posted the exchange.',
    target: 'username-field',
    icon: <MessageSquare className="w-5 h-5" />,
    position: 'right'
  },
  {
    id: 'title',
    title: 'Give Your Exchange a Title',
    description: 'Write a clear, descriptive title that explains what you\'re offering, requesting, or wanting to trade.',
    target: 'title-field',
    icon: <MessageSquare className="w-5 h-5" />,
    position: 'bottom'
  },
  {
    id: 'description',
    title: 'Add Details',
    description: 'Provide more information about the item - condition, size, color, or any other relevant details.',
    target: 'description-field',
    icon: <MessageSquare className="w-5 h-5" />,
    position: 'bottom'
  },
  {
    id: 'category',
    title: 'Choose a Category',
    description: 'Select the category that best fits your item. This helps organize posts in your Discord server.',
    target: 'category-field',
    icon: <MessageSquare className="w-5 h-5" />,
    position: 'bottom'
  },
  {
    id: 'exchange-type',
    title: 'Exchange Type',
    description: 'Choose "Give" to offer something free, "Request" to ask for something, or "Trade" to exchange items.',
    target: 'exchange-type-field',
    icon: <MessageSquare className="w-5 h-5" />,
    position: 'bottom'
  },
  {
    id: 'image',
    title: 'Add a Photo',
    description: 'Upload a clear photo of your item. For "Give" exchanges, a photo is required to help others see what you\'re offering.',
    target: 'image-field',
    icon: <Image className="w-5 h-5" />,
    position: 'bottom'
  },
  {
    id: 'location',
    title: 'Set Your Location',
    description: 'Type your general location or use the interactive map below to pinpoint where you are.',
    target: 'location-field',
    icon: <MapPin className="w-5 h-5" />,
    position: 'top'
  },
  {
    id: 'map',
    title: 'Interactive Map',
    description: 'Drag the marker to your exact location. The green circle shows a 2km radius where others can find you.',
    target: 'map-container',
    icon: <MapPin className="w-5 h-5" />,
    position: 'top',
    action: 'Click and drag the marker'
  },
  {
    id: 'submit',
    title: 'Submit Your Exchange',
    description: 'Once everything looks good, click submit to post your exchange to the Discord server. You\'ll automatically follow the post to get notifications.',
    target: 'submit-button',
    icon: <MessageSquare className="w-5 h-5" />,
    position: 'top'
  }
];

export function OnboardingTour({ isVisible, onComplete, onSkip }: OnboardingTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [highlightPosition, setHighlightPosition] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const currentTourStep = tourSteps[currentStep];

  useEffect(() => {
    if (isVisible && currentTourStep) {
      updateHighlight();
      window.addEventListener('resize', updateHighlight);
      return () => window.removeEventListener('resize', updateHighlight);
    }
  }, [isVisible, currentStep]);

  const updateHighlight = () => {
    if (!currentTourStep) return;
    
    const targetElement = document.querySelector(`[data-tour="${currentTourStep.target}"]`);
    if (targetElement) {
      const rect = targetElement.getBoundingClientRect();
      setHighlightPosition({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height
      });
    }
  };

  const nextStep = () => {
    if (currentStep < tourSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete();
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const skipTour = () => {
    onSkip();
  };

  if (!isVisible || !currentTourStep) return null;

  const getTooltipPosition = () => {
    if (!highlightPosition) return {};
    
    const tooltipWidth = 320;
    const tooltipHeight = 200;
    const padding = 16;
    
    switch (currentTourStep.position) {
      case 'top':
        return {
          top: highlightPosition.top - tooltipHeight - padding,
          left: highlightPosition.left + (highlightPosition.width / 2) - (tooltipWidth / 2),
        };
      case 'bottom':
        return {
          top: highlightPosition.top + highlightPosition.height + padding,
          left: highlightPosition.left + (highlightPosition.width / 2) - (tooltipWidth / 2),
        };
      case 'left':
        return {
          top: highlightPosition.top + (highlightPosition.height / 2) - (tooltipHeight / 2),
          left: highlightPosition.left - tooltipWidth - padding,
        };
      case 'right':
        return {
          top: highlightPosition.top + (highlightPosition.height / 2) - (tooltipHeight / 2),
          left: highlightPosition.left + highlightPosition.width + padding,
        };
      default:
        return {};
    }
  };

  return (
    <div className="fixed inset-0 z-50">
      {/* Dark overlay */}
      <div 
        ref={overlayRef}
        className="absolute inset-0 bg-black bg-opacity-60 transition-opacity duration-300"
      />
      
      {/* Highlight spotlight */}
      {highlightPosition && (
        <div
          className="absolute border-2 border-green-400 bg-transparent rounded-lg shadow-lg transition-all duration-300"
          style={{
            top: highlightPosition.top - 4,
            left: highlightPosition.left - 4,
            width: highlightPosition.width + 8,
            height: highlightPosition.height + 8,
            boxShadow: '0 0 0 4px rgba(34, 197, 94, 0.3), 0 0 20px rgba(34, 197, 94, 0.5)',
          }}
        />
      )}

      {/* Tooltip */}
      <Card 
        className="absolute w-80 bg-white border border-green-200 shadow-xl z-60"
        style={getTooltipPosition()}
      >
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1 bg-green-100 rounded">
                {currentTourStep.icon}
              </div>
              <h3 className="font-semibold text-gray-900">{currentTourStep.title}</h3>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={skipTour}
              className="h-6 w-6 p-0 hover:bg-gray-100"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
          
          <p className="text-sm text-gray-600 mb-4 leading-relaxed">
            {currentTourStep.description}
          </p>
          
          {currentTourStep.action && (
            <div className="mb-4 p-2 bg-green-50 rounded text-sm text-green-700 font-medium">
              💡 {currentTourStep.action}
            </div>
          )}
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              {tourSteps.map((_, index) => (
                <div
                  key={index}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    index === currentStep ? 'bg-green-500' : 'bg-gray-300'
                  }`}
                />
              ))}
            </div>
            
            <div className="flex items-center gap-2">
              {currentStep > 0 && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={prevStep}
                  className="h-8 px-3"
                >
                  <ArrowLeft className="w-3 h-3 mr-1" />
                  Back
                </Button>
              )}
              <Button 
                onClick={nextStep}
                size="sm"
                className="h-8 px-3 bg-green-600 hover:bg-green-700"
              >
                {currentStep === tourSteps.length - 1 ? 'Finish' : 'Next'}
                {currentStep < tourSteps.length - 1 && <ArrowRight className="w-3 h-3 ml-1" />}
              </Button>
            </div>
          </div>
          
          <div className="text-xs text-gray-500 mt-2 text-center">
            Step {currentStep + 1} of {tourSteps.length}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}