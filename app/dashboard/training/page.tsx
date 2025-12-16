"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { BookOpen, CheckCircle, Clock, Play, Award, Search, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

interface Course {
  id: string
  title: string
  description: string
  level: "beginner" | "intermediate" | "advanced"
  duration: number // in minutes
  modules: number
  image: string
  progress?: number
  completed?: boolean
  instructor: {
    name: string
    avatar?: string
  }
  tags: string[]
}

export default function TrainingCenterPage() {
  const [courses] = useState<Course[]>([
    {
      id: "course-1",
      title: "SOC Analyst Fundamentals",
      description: "Learn the essential skills and tools needed to become an effective SOC analyst",
      level: "beginner",
      duration: 240,
      modules: 8,
      image: "/placeholder.svg?height=200&width=400",
      progress: 75,
      instructor: {
        name: "Dr. Sarah Chen",
        avatar: "/placeholder.svg?height=40&width=40",
      },
      tags: ["SOC", "SIEM", "Threat Detection"],
    },
    {
      id: "course-2",
      title: "Advanced Threat Hunting",
      description: "Master proactive threat hunting techniques to identify hidden adversaries",
      level: "advanced",
      duration: 360,
      modules: 12,
      image: "/placeholder.svg?height=200&width=400",
      progress: 30,
      instructor: {
        name: "Michael Rodriguez",
        avatar: "/placeholder.svg?height=40&width=40",
      },
      tags: ["Threat Hunting", "EDR", "MITRE ATT&CK"],
    },
    {
      id: "course-3",
      title: "Incident Response Playbooks",
      description: "Learn to create and execute effective incident response playbooks",
      level: "intermediate",
      duration: 180,
      modules: 6,
      image: "/placeholder.svg?height=200&width=400",
      completed: true,
      instructor: {
        name: "Alex Johnson",
        avatar: "/placeholder.svg?height=40&width=40",
      },
      tags: ["Incident Response", "Playbooks", "SOAR"],
    },
    {
      id: "course-4",
      title: "Malware Analysis Essentials",
      description: "Develop skills to analyze and understand malicious software",
      level: "intermediate",
      duration: 300,
      modules: 10,
      image: "/placeholder.svg?height=200&width=400",
      instructor: {
        name: "Dr. James Wilson",
        avatar: "/placeholder.svg?height=40&width=40",
      },
      tags: ["Malware", "Reverse Engineering", "Sandbox Analysis"],
    },
    {
      id: "course-5",
      title: "Cloud Security Monitoring",
      description: "Learn to monitor and secure cloud environments effectively",
      level: "intermediate",
      duration: 270,
      modules: 9,
      image: "/placeholder.svg?height=200&width=400",
      instructor: {
        name: "Emma Davis",
        avatar: "/placeholder.svg?height=40&width=40",
      },
      tags: ["Cloud Security", "AWS", "Azure", "GCP"],
    },
    {
      id: "course-6",
      title: "Threat Intelligence Fundamentals",
      description: "Learn how to collect, analyze and apply threat intelligence",
      level: "beginner",
      duration: 210,
      modules: 7,
      image: "/placeholder.svg?height=200&width=400",
      instructor: {
        name: "Robert Kim",
        avatar: "/placeholder.svg?height=40&width=40",
      },
      tags: ["Threat Intelligence", "IOCs", "TTP Analysis"],
    },
  ])

  const [searchTerm, setSearchTerm] = useState("")
  const [levelFilter, setLevelFilter] = useState<string>("all")

  const filteredCourses = courses.filter((course) => {
    const matchesSearch =
      searchTerm === "" ||
      course.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      course.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      course.tags.some((tag) => tag.toLowerCase().includes(searchTerm.toLowerCase()))

    const matchesLevel = levelFilter === "all" || course.level === levelFilter

    return matchesSearch && matchesLevel
  })

  const inProgressCourses = courses.filter((course) => course.progress !== undefined && !course.completed)
  const completedCourses = courses.filter((course) => course.completed)

  const getLevelBadge = (level: string) => {
    switch (level) {
      case "beginner":
        return (
          <Badge variant="outline" className="bg-green-500/10 text-green-500">
            Beginner
          </Badge>
        )
      case "intermediate":
        return (
          <Badge variant="outline" className="bg-blue-500/10 text-blue-500">
            Intermediate
          </Badge>
        )
      case "advanced":
        return (
          <Badge variant="outline" className="bg-purple-500/10 text-purple-500">
            Advanced
          </Badge>
        )
      default:
        return null
    }
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Training Center</h1>
          <p className="text-muted-foreground">Enhance your security skills with interactive courses and exercises</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle>Your Learning Progress</CardTitle>
            <CardDescription>Track your ongoing courses and achievements</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="in-progress">
              <TabsList className="mb-4">
                <TabsTrigger value="in-progress">In Progress</TabsTrigger>
                <TabsTrigger value="completed">Completed</TabsTrigger>
                <TabsTrigger value="recommended">Recommended</TabsTrigger>
              </TabsList>
              <TabsContent value="in-progress">
                {inProgressCourses.length === 0 ? (
                  <div className="text-center py-12">
                    <BookOpen className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
                    <h3 className="text-lg font-medium">No courses in progress</h3>
                    <p className="text-muted-foreground">Start a course to track your progress here</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {inProgressCourses.map((course) => (
                      <div key={course.id} className="border rounded-lg p-4">
                        <div className="flex flex-col md:flex-row gap-4">
                          <img
                            src={course.image || "/placeholder.svg"}
                            alt={course.title}
                            className="rounded-md w-full md:w-48 h-32 object-cover"
                          />
                          <div className="flex-1">
                            <div className="flex items-start justify-between">
                              <div>
                                <h3 className="font-medium">{course.title}</h3>
                                <div className="flex items-center gap-2 mt-1">
                                  {getLevelBadge(course.level)}
                                  <span className="text-sm text-muted-foreground">
                                    {course.modules} modules • {Math.floor(course.duration / 60)}h{" "}
                                    {course.duration % 60}m
                                  </span>
                                </div>
                              </div>
                              <Button size="sm">
                                <Play className="h-4 w-4 mr-2" />
                                Continue
                              </Button>
                            </div>
                            <div className="mt-4 space-y-1">
                              <div className="flex items-center justify-between text-sm">
                                <span>Progress</span>
                                <span className="font-medium">{course.progress}%</span>
                              </div>
                              <Progress value={course.progress} className="h-2" />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
              <TabsContent value="completed">
                {completedCourses.length === 0 ? (
                  <div className="text-center py-12">
                    <CheckCircle className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
                    <h3 className="text-lg font-medium">No completed courses</h3>
                    <p className="text-muted-foreground">Complete a course to see it listed here</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {completedCourses.map((course) => (
                      <div key={course.id} className="border rounded-lg p-4">
                        <div className="flex flex-col md:flex-row gap-4">
                          <img
                            src={course.image || "/placeholder.svg"}
                            alt={course.title}
                            className="rounded-md w-full md:w-48 h-32 object-cover"
                          />
                          <div className="flex-1">
                            <div className="flex items-start justify-between">
                              <div>
                                <h3 className="font-medium">{course.title}</h3>
                                <div className="flex items-center gap-2 mt-1">
                                  {getLevelBadge(course.level)}
                                  <span className="text-sm text-muted-foreground">
                                    {course.modules} modules • {Math.floor(course.duration / 60)}h{" "}
                                    {course.duration % 60}m
                                  </span>
                                </div>
                              </div>
                              <Badge variant="outline" className="bg-green-500/10 text-green-500">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Completed
                              </Badge>
                            </div>
                            <div className="mt-2">
                              <Button variant="outline" size="sm">
                                Review Course
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
              <TabsContent value="recommended">
                <div className="space-y-4">
                  {courses.slice(3, 5).map((course) => (
                    <div key={course.id} className="border rounded-lg p-4">
                      <div className="flex flex-col md:flex-row gap-4">
                        <img
                          src={course.image || "/placeholder.svg"}
                          alt={course.title}
                          className="rounded-md w-full md:w-48 h-32 object-cover"
                        />
                        <div className="flex-1">
                          <div className="flex items-start justify-between">
                            <div>
                              <h3 className="font-medium">{course.title}</h3>
                              <div className="flex items-center gap-2 mt-1">
                                {getLevelBadge(course.level)}
                                <span className="text-sm text-muted-foreground">
                                  {course.modules} modules • {Math.floor(course.duration / 60)}h {course.duration % 60}m
                                </span>
                              </div>
                              <p className="text-sm text-muted-foreground mt-2">{course.description}</p>
                            </div>
                          </div>
                          <div className="mt-2">
                            <Button size="sm">Start Course</Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Your Achievements</CardTitle>
              <CardDescription>Badges and certifications earned</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div className="flex flex-col items-center text-center">
                  <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                    <Award className="h-8 w-8 text-primary" />
                  </div>
                  <span className="text-xs font-medium">SOC Basics</span>
                </div>
                <div className="flex flex-col items-center text-center">
                  <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                    <Award className="h-8 w-8 text-primary" />
                  </div>
                  <span className="text-xs font-medium">IR Expert</span>
                </div>
                <div className="flex flex-col items-center text-center opacity-40">
                  <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-2">
                    <Award className="h-8 w-8" />
                  </div>
                  <span className="text-xs font-medium">Locked</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Learning Stats</CardTitle>
              <CardDescription>Your training activity</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="border rounded p-3 text-center">
                  <div className="text-2xl font-bold">3</div>
                  <div className="text-xs text-muted-foreground">Courses Taken</div>
                </div>
                <div className="border rounded p-3 text-center">
                  <div className="text-2xl font-bold">12h</div>
                  <div className="text-xs text-muted-foreground">Learning Time</div>
                </div>
                <div className="border rounded p-3 text-center">
                  <div className="text-2xl font-bold">1</div>
                  <div className="text-xs text-muted-foreground">Completed</div>
                </div>
                <div className="border rounded p-3 text-center">
                  <div className="text-2xl font-bold">2</div>
                  <div className="text-xs text-muted-foreground">In Progress</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Course Catalog</CardTitle>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search courses..."
                className="pl-8"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Select value={levelFilter} onValueChange={setLevelFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Levels</SelectItem>
                <SelectItem value="beginner">Beginner</SelectItem>
                <SelectItem value="intermediate">Intermediate</SelectItem>
                <SelectItem value="advanced">Advanced</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredCourses.length === 0 ? (
              <div className="col-span-full text-center py-12">
                <Search className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
                <h3 className="text-lg font-medium">No courses found</h3>
                <p className="text-muted-foreground">Try adjusting your search or filters</p>
              </div>
            ) : (
              filteredCourses.map((course) => (
                <motion.div key={course.id} whileHover={{ y: -5 }} transition={{ duration: 0.2 }}>
                  <Card className="h-full flex flex-col overflow-hidden">
                    <img
                      src={course.image || "/placeholder.svg"}
                      alt={course.title}
                      className="w-full h-40 object-cover"
                    />
                    <CardHeader className="pb-2">
                      <div className="flex justify-between items-start">
                        <CardTitle className="text-lg">{course.title}</CardTitle>
                        {getLevelBadge(course.level)}
                      </div>
                      <CardDescription>{course.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        <span>
                          {Math.floor(course.duration / 60)}h {course.duration % 60}m
                        </span>
                        <span>•</span>
                        <span>{course.modules} modules</span>
                      </div>
                      <div className="flex items-center gap-2 mt-3">
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={course.instructor.avatar || "/placeholder.svg"} />
                          <AvatarFallback>{course.instructor.name.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <span className="text-sm">{course.instructor.name}</span>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-3">
                        {course.tags.map((tag) => (
                          <Badge key={tag} variant="secondary" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                    <CardFooter className="border-t pt-4">
                      <Button className="w-full">
                        {course.progress !== undefined ? "Continue Course" : "Start Course"}
                        <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    </CardFooter>
                  </Card>
                </motion.div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
