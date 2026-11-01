workspace {
    model {
        u = person "U" "" "Internal"
        v = person "V" "" "External"
        a = softwareSystem "A" "" "Internal,Core" {
            c1 = container "C1" "" "Java" "Api"
            c2 = container "C2" "" "Node" {
                properties {
                    "tier" "front"
                }
            }
            c3 = container "C3" "" "Java"
        }
        b = softwareSystem "B" "" "External"
        u -> c1 "Uses" "" "Sync"
        v -> c2 "Uses" "" "Async"
        c2 -> c1 "Calls" "" "Async"
        c1 -> b "Reads" "" "Sync"
        c3 -> b "Writes"
    }
    views {
        systemLandscape "ByTag" {
            include "element.tag==Internal"
            include "element.tag!=Internal,Core"
            exclude "element.tag==External && element.type==Person"
        }
        container a "Typed" {
            include "element.type==Container"
            include "element.technology==Java"
            exclude "relationship.tag==Async"
        }
        container a "Coupled" {
            include ->c1
            include c2->
            include "element.parent==a"
            exclude c3
        }
        container a "Properties" {
            include "element.properties[tier]==front"
            include "element.technology!=Java"
            include "relationship.source==c2"
        }
        systemContext a "Reluctant" {
            include *?
            include "->a->"
        }
        container a "Relationships" {
            include c1 c2 u v b
            exclude "c2->c1"
            exclude "relationship.destination==b"
        }
    }
}
