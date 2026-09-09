import {
  useState,
  useEffect,
} from 'react';

import {
  User,
  Camera,
  Save,
  Loader2,
  Sparkles,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { useNavigate } from 'react-router-dom';

const Profile = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [profile, setProfile] = useState({
    full_name: '',
    username: '',
    bio: '',
    avatar_url: '',
  });

  useEffect(() => {
    if (user) {
      loadProfile();
    }
  }, [user]);

  const loadProfile = async () => {
    if (!user) return;

    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) throw error;

      setProfile({
        full_name: data?.full_name || '',
        username: data?.username || '',
        bio: data?.bio || '',
        avatar_url: data?.avatar_url || '',
      });
    } catch (error) {
      console.error('Error loading profile:', error);
      toast({
        title: 'Error',
        description: 'Could not load your profile.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;

    try {
      setSaving(true);

      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: profile.full_name,
          username: profile.username,
          bio: profile.bio,
          avatar_url: profile.avatar_url,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (error) throw error;

      toast({
        title: 'Profile saved',
        description: 'Your profile has been updated.',
      });
    } catch (error) {
      console.error('Error saving profile:', error);
      toast({
        title: 'Error',
        description: 'Could not save your profile.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (event) => {
    const file = event.target.files?.[0];

    if (!file || !user) return;

    try {
      setUploading(true);

      const fileExt = file.name.split('.').pop();
      const filePath = `${user.id}/avatar.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, {
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      setProfile((prev) => ({
        ...prev,
        avatar_url: data.publicUrl,
      }));

      toast({
        title: 'Photo updated',
        description: 'Your profile photo has been uploaded.',
      });
    } catch (error) {
      console.error('Error uploading avatar:', error);
      toast({
        title: 'Upload failed',
        description: 'Could not upload your profile photo.',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  const handleGenerateNewProgram = async () => {
    if (!user) return;

    try {
      setGenerating(true);

      const { data, error } = await supabase.functions.invoke(
        'ai-generate',
        {
          body: {
            userId: user.id,
            action: 'generate_program',
          },
        }
      );

      if (error) throw error;

      toast({
        title: 'Program generated',
        description: 'Your new program is ready.',
      });

      navigate('/program');
    } catch (error) {
      console.error('Error generating program:', error);
      toast({
        title: 'Could not generate program',
        description:
          error?.message || 'Please try again in a moment.',
        variant: 'destructive',
      });
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const initials =
    profile.full_name
      ?.split(' ')
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() ||
    user?.email?.[0]?.toUpperCase() ||
    'U';

  return (
    <div className="container mx-auto max-w-4xl px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Profile</h1>
        <p className="text-muted-foreground">
          Manage your profile information.
        </p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Personal Information
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="flex flex-col items-center gap-4 sm:flex-row">
              <Avatar className="h-24 w-24">
                <AvatarImage
                  src={profile.avatar_url}
                  alt={profile.full_name || 'Profile'}
                />
                <AvatarFallback className="text-xl">
                  {initials}
                </AvatarFallback>
              </Avatar>

              <div>
                <Label
                  htmlFor="avatar-upload"
                  className="cursor-pointer"
                >
                  <Button
                    type="button"
                    variant="outline"
                    disabled={uploading}
                    asChild
                  >
                    <span>
                      {uploading ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Camera className="mr-2 h-4 w-4" />
                      )}
                      Change Photo
                    </span>
                  </Button>
                </Label>

                <Input
                  id="avatar-upload"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarUpload}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="full_name">Full Name</Label>
                <Input
                  id="full_name"
                  value={profile.full_name}
                  onChange={(e) =>
                    setProfile((prev) => ({
                      ...prev,
                      full_name: e.target.value,
                    }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  value={profile.username}
                  onChange={(e) =>
                    setProfile((prev) => ({
                      ...prev,
                      username: e.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bio">Bio</Label>
              <Textarea
                id="bio"
                value={profile.bio}
                onChange={(e) =>
                  setProfile((prev) => ({
                    ...prev,
                    bio: e.target.value,
                  }))
                }
                rows={4}
              />
            </div>

            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save Changes
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Program</CardTitle>
          </CardHeader>

          <CardContent>
            <Button
              onClick={handleGenerateNewProgram}
              disabled={generating}
            >
              {generating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              Generate New Program
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Profile;
